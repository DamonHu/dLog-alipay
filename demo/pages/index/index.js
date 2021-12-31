import dLog from '/utils/dLog'

Page({
  onLoad(query) {
    // 页面加载
    console.info(`Page onLoad with query: ${JSON.stringify(query)}`);
  },
  
  onClickW(){
    dLog.log("write")
  },
  
  onClickR(){
    dLog.read([dLog.LogFilePathType.log], function(res){
      console.log(res)
    })
  },

  onClickA(){
    dLog.read([dLog.LogFilePathType.log, dLog.LogFilePathType.backup, dLog.LogFilePathType.archive], function(res){
      console.log(res)
    })
  },
  
  onClickD(){
    dLog.clean()
  }
});
