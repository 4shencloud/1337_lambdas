## Setup instructions:
  Make sure serverless is installed and authenticated\
  Install dependencies: `npm i`\
  Deploy to AWS: `serverless deploy`\
  Get the lambda url

## To test:
  Run the test script: `node test.js <DEPLOYED URL HERE>`\
  It will create a bunch of tasks and output processing/dlq function logs.\
  To test manually POST fetch the lambda url with this body (make sure id is unique):\
  `{
    "taskId": "1",
    "payload": {
      "test": "testval"
    }
  }`\
  To clean up: `serverless remove`

## Architecture:
```
  [Client]
    |
    | HTTP POST /submit
    v
  [API Gateway]
    |
    v
  [Lambda: submitTask]
    |\
    | \-- Check uniqueness
    | \-- Save task with retryCount = 0 to dynamo
    | \-- Send message to SQS
    |
    v
  [SQS: TaskQueue] --> [Lambda: processTask]
                              |
                              |-- Simulate task (60% failure)
                              |-- If fail increment retryCount and requeue with exponential delay
                              |-- If max retries exceeded - throw error so that message moves to DLQ
                              |
                              |-- If success - remove from dynamo
    |
    v
  [Lambda: monitorDLQ]
    |
    |-- Log and delete from dynamo
    v
  [CloudWatch Alarm]
```