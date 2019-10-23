# MutexLocks
Concurrency Controller In NodeJs to avoid Race-Around Conditions and achieve Mutual Exclusion 

Usage

    Method 
    acquireLock(resourceName:string,expiryDuration:number,cb:MainCallback,finishHandler:Function)
    resourceName:name of resource you wish to acquire
    expiryDuration:max number of millis to wait for timeout
    cb: Main callback which will be called whenever lock is acquired OR error occured,
        Params of cb are (error:MutexLockError|null,taskId:number,lockInstance:null|MyLockInstance)
        error:
        {
            errCode:number  //TIMEOUT ERROR,QUEUE_OVERFLOW ERROR denoting the max limit reached for pending task
            message:string
        },//If error is not null ,no need to explicitly release the lock
        taskId:A unique task id assigned whenever it is addded to the Queue to acquire a lock
        lockInstance: If err is null,use this instance to release the acquired lock using lockInstance.releaseLock(taskId)
    finishHandler: will be called when lock has been released




Example:



    acquireLock(`LOCK:${userId}`,1000,async function(error:MutexLockError|null,taskId:number,lockInstance:MyLockInstance|null)
        {
            try
            {
                if(error)
                {
                    /*No Need to release this lock...*/
                    console.log("Error Acquiring Lock");
                    return;
                }
                
                let balance= await wallet.getBalance(userId);
                console.log(`BALANCE REMAING: ${balance}`);
                if(balance<deductAmount)
                {
                    reject("Low Balance");
                }
                else
                {
                    await wallet.deductBalance(userId,deductAmount);
                    resolve("Payment Done");
                }           
            }
            catch(e)
            {
                reject(e);
            }
            finally
            {
                if(!error && lockInstance)
                lockInstance.releaseLock(taskId);
            }
        },
        function()
        {
          //LOCK RELEASE ACKNOWLEDGEMENT
        });
