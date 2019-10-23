var LOCK_MAP:Map<string,MyLockInstance>=new Map();
var TASK_COUNTER=0;
var throwErrors=true;
const DEFAULT_MAX_EXPIRY_DURATION=1000*20;//20 SECS
const DEFAULT_MIN_EXPIRY_DURATION=1000*1;//1 SECS
const DEFAULT_MAX_QUEUE_SIZE=1000;
const MAX_PENDING_TASK_ALLOWED=10000;
let currentPendingTaskCount=0;

interface MainCallback
{
    (error:MutexLockError|null,taskId:number,lockInstance:null|MyLockInstance):void,
}

export interface MutexLockError
{
    errCode:MutexLockErrorCodes,
    message:string,
}

export enum MutexLockErrorCodes
{
    TIME_OUT=1001,
    QUEUE_OVERFLOW=1002,
}

enum Messages
{
    UNCAUGHT_ERROR_IN_QUEUE_OVERLOW='Uncaught Error in handleQueueOverflow',
    QUEUE_OVERFLOW='Pending task limit reached',
    PENDING_QUEUE_EMPTY='All tasks in Pending Queue has been completed',
    TIME_OUT_OCCURED='Timeout occured',
    TIME_OUT_FAILED_TASK_NOT_FOUND='Timeout failed,Task not found in Queue',
    UNCAUGHT_ERROR_IN_TIMEOUT='Uncaught Error in handleTimeout',
    NEW_TASK_FROM_QUEUE_STARTED='New task from Queue has started',
    UNCAUGHT_ERROR_IN_MAIN_CALLBACK='Uncaught Error in mainCallback',
    LOCK_RELEASE_FAILED_TASK_NOT_FOUND='Lock Release failed,Task not found in Queue',
    UNCAUGHT_ERROR_IN_LOCK_RELEASE='Uncaught Error in lockRelease',
}


//making it singleton

class MyLockTask
{
    expiryDuration:number;
    cb:MainCallback;
    finishHandler:Function;
    timer:NodeJS.Timeout|null=null;
    taskId:number;
    constructor(expiryDuration:number,cb:MainCallback,finishHandler:Function)
    {
        this.expiryDuration=expiryDuration;
        this.cb=cb;
        this.finishHandler=finishHandler;
        this.taskId=TASK_COUNTER++;
    }
}

export class MyLockInstance
{
    lockName:string
    taskList:Array<MyLockTask>;
    maxQueueSize:number;
    isLocked:boolean;

    constructor(lockName:string)
    {
        this.taskList=[];
        this.maxQueueSize=DEFAULT_MAX_QUEUE_SIZE;
        this.isLocked=false;
        this.lockName=lockName;
    }

    public releaseLock(taskId:number)
    {
        let d=`[Task '${taskId}'],[LockName '${this.lockName}']`;
        try
        {
            let myTask=this.taskList[0];
            if(myTask && myTask.taskId===taskId)
            {
                this.taskList.shift();
                currentPendingTaskCount--;
                finishHandlerCallback(myTask);


                let newPendingTask=this.taskList[0];
                if(newPendingTask)
                {
                    mainCallback(newPendingTask,this);
                }
                else
                {
                    console.log(`${Messages.PENDING_QUEUE_EMPTY} :${d}`);
                    this.isLocked=false;
                }
            }
            else
            {
                let x=`${Messages.LOCK_RELEASE_FAILED_TASK_NOT_FOUND} :${d}`;
                console.log(x);
                if(throwErrors)
                throw new Error(x);
            }
        }
        catch(e)
        {
            let x=`${Messages.UNCAUGHT_ERROR_IN_LOCK_RELEASE} :${d},Error:${e}`;
            console.log(x);
            if(throwErrors)
            throw new Error(x);
        }
    }
}

function finishHandlerCallback(myTask:MyLockTask)
{
    try
    {
       console.log(`Running task from Queue '${myTask.taskId}' has completed`);
        myTask.finishHandler();
    }
    catch(e)
    {
       console.log(`Uncaught Error in Task finishHandler taskId:'${myTask.taskId}'`);
        if(throwErrors)
        throw new Error(`Uncaught Error in Task finishHandler taskId:'${myTask.taskId}'`);
    }
}

function mainCallback(myTask:MyLockTask,lockInstance:MyLockInstance)
{
    let d=`[Task '${myTask.taskId}'],[LockName '${lockInstance.lockName}']`;
    try
    {
        if(myTask.timer)
        {
            clearTimeout(myTask.timer);
            myTask.timer=null;
        }
        let x=`${Messages.NEW_TASK_FROM_QUEUE_STARTED} :${d}`;

        console.log(x);
        myTask.cb(null,myTask.taskId,lockInstance);
    }
    catch(e)
    {
        let x=`${Messages.UNCAUGHT_ERROR_IN_MAIN_CALLBACK} :${d},Error:${e}`;
        console.log(x);
        if(throwErrors)
        throw new Error(x);
    }
}

function handleTimeout(myTask:MyLockTask,lockInstance:MyLockInstance)
{
    let d=`[Task '${myTask.taskId}'],[LockName '${lockInstance.lockName}']`;
    try
    {
        let indexToRemove=-1;
        for(let i=0;i<lockInstance.taskList.length;i++)
        {
            if(lockInstance.taskList[i].taskId===myTask.taskId)
            {
                indexToRemove=i;
                break;
            }
        }

        if(indexToRemove>=0 && myTask.timer)
        {
            lockInstance.taskList.splice(indexToRemove, 1);
            currentPendingTaskCount--;
            myTask.timer=null;

            if(lockInstance.taskList.length==0)
            {
                console.log(`${Messages.PENDING_QUEUE_EMPTY} :${d}`);
                lockInstance.isLocked=false;
            }

            const errorString=`${Messages.TIME_OUT_OCCURED} :${d}`;
            console.log(errorString);

            let error:MutexLockError=
            {
                errCode:MutexLockErrorCodes.TIME_OUT,
                message:errorString
            }
    
            myTask.cb(error,myTask.taskId,null);
        }
        else
        {
            let x=`${Messages.TIME_OUT_FAILED_TASK_NOT_FOUND} :${d}`;
            console.log(x);
            if(throwErrors)
            throw new Error(x);
        }
    }
    catch(e)
    {
        let x=`${Messages.UNCAUGHT_ERROR_IN_TIMEOUT} :${d},Error:${e}`;
        console.log(x);
        if(throwErrors)
        throw new Error(x);
    }
}

function handleQueueOverflow(myTask:MyLockTask,lockName:string)
{
    let d=`[Task '${myTask.taskId}'],[LockName '${lockName}']`;
    try
    {
        const errorString=`${Messages.QUEUE_OVERFLOW} :${d}`;
        console.log(errorString);
        let error:MutexLockError=
        {
            errCode:MutexLockErrorCodes.QUEUE_OVERFLOW,
            message:errorString
        }
        myTask.cb(error,myTask.taskId,null);
    }   
    catch(e)
    {
        let x=`${Messages.UNCAUGHT_ERROR_IN_QUEUE_OVERLOW} :${d},Error:${e}`;
        console.log(x);
        if(throwErrors)
        throw new Error(x);
    } 
}


//interface releaseLockType { (taskId:number): void }

export function acquireLock(resourceName:string,expiryDuration:number,cb:MainCallback,finishHandler:Function)
{
    expiryDuration=Math.max(expiryDuration,DEFAULT_MIN_EXPIRY_DURATION);
    expiryDuration=Math.min(expiryDuration,DEFAULT_MAX_EXPIRY_DURATION);

    let lockInstance= LOCK_MAP.get(resourceName);
    if(!lockInstance)
    {
        lockInstance=new MyLockInstance(resourceName);
        LOCK_MAP.set(resourceName,lockInstance);
    }

    let lockTask:MyLockTask=new MyLockTask(expiryDuration,cb,finishHandler);

    if(currentPendingTaskCount>=MAX_PENDING_TASK_ALLOWED || lockInstance.taskList.length>=lockInstance.maxQueueSize)
    {
        handleQueueOverflow(lockTask,lockInstance.lockName);
        return;
    }

    currentPendingTaskCount++;
    lockInstance.taskList.push(lockTask);

    if(lockInstance.isLocked)
    {
        let timer= setTimeout(function()
        {
            handleTimeout(lockTask,lockInstance as MyLockInstance);
        },expiryDuration);
        lockTask.timer=timer;
    }
    else
    {
        lockInstance.isLocked=true;
        mainCallback(lockTask,lockInstance);
    }
}
