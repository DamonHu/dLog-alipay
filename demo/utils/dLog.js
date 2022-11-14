var _debugMode = false       //调试模式
let _needCheckLogFile = true //首次检查log文件大小和状态
let _checkLogFileComplete = false  //log文件检查完成

/** 数据类型说明 **/
/**
 * 写入逻辑
 * log(大于2M时进入下级) >> logTemp(随时删除) >> backup(备份，大于10M归档后删除) >> archive(归档)
 * 
 * 时效性&作用
 * log最新内容，提交反馈使用，只有该类型上传之后需要调用clean清空数据
 * backup备份内容，时效性介于log和archive，大小在2M~10M
 * archive归档内容，提交历史数据使用，自动被覆盖更新
 */
const LogFilePathType = {
  "log": "/dLog.txt",
  "logTemp": "/dLog_temp.txt",  //缓存数据，不建议读取
  "backup": "/dLog_backup.txt",
  "archive": "/dLog_archive.txt"
}

const log = function () {
  let time = _currentTime()
  let vars = Array.prototype.slice.call(arguments)
  vars.unshift(`>>>${time}>>>`)
  console.warn.apply(console, vars)
  //上报
  var string = ""
  try {
    string = JSON.stringify(vars)
  } catch (error) {
    console.error("dLog json error", error)
    for (let index = 0; index < vars.length; index++) {
      string = string + vars[index].toString();
    }
  }
  //检测大小，最快上传，超过2M启动备份检查
  if (_needCheckLogFile) {
    _fileManager.getFileInfo({
      filePath: _logFilePath(),
      success: (res) => {
        _debugLog("delog check success", res);
        if (res.size > 2 * 1024 * 1024) {
          _backup()
        } else {
          _checkLogFileComplete = true
        }
      },
      fail: (error) => {
        _debugLog("delog check error:", error);
        _checkLogFileComplete = true
      }
    })
    _needCheckLogFile = false
  }
  if (_checkLogFileComplete) {
    _prepareWrite(LogFilePathType.log, "\n\n====>>>>>>" + time + "====>>>>>\n\n" + string)
  }
}

const clean = function () {
  _clean(LogFilePathType.log)
}

const read = function (typeList = [LogFilePathType.log], complete, content = "") {
  _read(typeList[0], function(res){
    if (typeList.length > 0) {
      var _typeList = typeList
      _typeList.shift()
      let _content = content + res.data
      read(_typeList, complete, _content)
    } else {
      res.data = content
      complete(res)
    }
  })
}

/******************* private **************************/
const _fileManager = my.getFileSystemManager()

const _logFilePath = function (type = LogFilePathType.log) {
  return my.env.USER_DATA_PATH + type
}

const _prepareWrite = function (type = LogFilePathType.log, content, complete) {
  _fileManager.access({
    path: _logFilePath(type),
    success: (res) => {
      //文件存在，写入内容
      _write(type, content, complete)
    },
    fail: (error) => {
      //文件不存在，创建文件
      _fileManager.writeFile({
        filePath: _logFilePath(type),
        data: '\n\ncreate time: ' + _currentTime(),
        success: (createRes) => {
          _debugLog("create" + _logFilePath(type) + "success");
          _write(type, content, complete)
        },
        fail: (createError) => {
          _debugLog("create" + _logFilePath(type) + "fail", createError);
        },
      })
    }
  })
}

const _read = function (type = LogFilePathType.log, complete) {
  _fileManager.readFile({
      filePath: _logFilePath(type),
      encoding: "utf8",
      success: (res) => {
        res.data = JSON.stringify(res.data)
        if (complete != null) {
          complete(res)
        }
      },
      fail: (error) => {
        _debugLog("dLog read fail, skip read: ", error);
        if (complete != null) {
          var res = {
            data: "dLog read fail: " + error.error + error.errorMessage
          }
          complete(res)
        }
      }
    });
}

const _write = function (type = LogFilePathType.log, content, complete) {
  _fileManager.appendFile({
    filePath: _logFilePath(type),
    data: content,
    encoding: 'utf8',
    success: (res) => {
      // console.log("append write success")
      if (complete != null) {
        complete()
      }
    },
    fail: (error) => {
      console.error("append write fail: ", error)
    }
  })
}

const _backup = function () {
  _debugLog("dlog start backup");
  //1、创建新的日志文件，以便继续写入
   _fileManager.rename({
    oldPath: _logFilePath(),
    newPath: _logFilePath(LogFilePathType.logTemp),
    success: () => {
      //2、读取日志内容写入备份数据
      read([_logFilePath(LogFilePathType.logTemp)], function(readRes) {
        _prepareWrite(LogFilePathType.backup, readRes.data, function(){
          //3、删除临时的日志文件，检测备份条件
          _clean(LogFilePathType.logTemp)
          _fileManager.getFileInfo({
            filePath: _logFilePath(LogFilePathType.backup),
              success: (res) => {
                //4、大于10M，删除最早的备份archive数据，使用该数据备份存储
                if (res.size > 10 * 1024 * 1024) {
                  _clean(LogFilePathType.archive, function () {
                    _fileManager.rename({
                      oldPath: _logFilePath(LogFilePathType.backup),
                      newPath: _logFilePath(LogFilePathType.archive),
                      success: (res) => {
                        //5、清理缓存，备份成功 Done
                        _clean(LogFilePathType.backup)
                        _debugLog("backup success");
                      }
                    })
                  })
                }
              },
              fail: (error) => {
                _debugLog("backup error", error);
              }
          })
        })
      })
      _checkLogFileComplete = true
    },
    fail: (error) => {
      _debugLog("dLog backup, rename error: ", error);
      _checkLogFileComplete = true
    }
  })  
}

const _clean = function (type = LogFilePathType.log, complete) {
  _fileManager.access({
    path: _logFilePath(type),
    success: () => {
      _fileManager.unlink({
        filePath: _logFilePath(type),
        success: () => {
          _debugLog("log delete success");
          if (complete != null) {
            complete()
          }
        }
      });
    },
    fail: (error) => {
      if (res.error == 10022) {
        _debugLog("_clean error, no such log file");
      } else {
        _debugLog("_clean error, no such log file", error);
      }
      if (complete != null) {
        complete()
      }
    }
  })
}

const _currentTime = function() {
  let date = new Date()
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return "" + year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second
}

const _debugLog = function() {
  if (_debugMode) {
    console.log("[dLog] ", arguments);
  }
}

export default {
  log: log,
  clean: clean,
  read: read,
  LogFilePathType: LogFilePathType
}