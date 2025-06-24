## Setup instructions:
  Make sure serverless is installed and authenticated
  Install dependencies: `npm i`
  Deploy to AWS: `serverless deploy`
  Get the lambda url

## To test:
  Run the test script: `node test.js <DEPLOYED URL HERE>`
  It will create a bunch of tasks and output processing/dlq function logs.
  To test manually POST fetch the lambda url with this body (make sure id is unique):
  `{
    "taskId": "1",
    "payload": {
      "test": "testval"
    }
  }`

## Architecture:
