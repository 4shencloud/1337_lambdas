import { DynamoDB, SQS } from 'aws-sdk';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSHandler
} from 'aws-lambda';

const sqs = new SQS();
const dynamo = new DynamoDB.DocumentClient();

const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL!;
const TASK_RETRY_TABLE = process.env.TASK_RETRY_TABLE!;
const MAX_RETRIES = 2;

export const submitTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ message: 'No request body' }) };
  }

  const { taskId, payload } = JSON.parse(event.body);

  if (!taskId || typeof taskId !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ message: 'Bad id' }) };
  }

  if (!payload || typeof payload !== 'object' || !!payload.length) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Bad payload' }) };
  }

  const exists = await dynamo.get({ // no dups
    TableName: TASK_RETRY_TABLE,
    Key: { taskId }
  }).promise();

  if (exists.Item) {
    return { statusCode: 409, body: JSON.stringify({ message: 'Task already submitted' }) };
  }

  await dynamo.put({ // save to db for persistence
    TableName: TASK_RETRY_TABLE,
    Item: { taskId, payload, retryCount: 0 }
  }).promise();

  await sqs.sendMessage({ // enqueue
    QueueUrl: TASK_QUEUE_URL,
    MessageBody: JSON.stringify({ taskId }),
  }).promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Task submitted', taskId }),
  };
};

export const processTask: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const { taskId } = JSON.parse(record.body);

    const res = await dynamo.get({
      TableName: TASK_RETRY_TABLE,
      Key: { taskId }
    }).promise();

    const item = res.Item;
    if (!item) {
      // it's either processed or in dlq
      console.warn(`Task ${taskId} not in db, skipping`);
      continue;
    }

    const { payload, retryCount } = item;
    const fail = Math.random() < 0.6; // increased to 60% for faster testing

    if (fail) {
      const newRetry = retryCount + 1;

      if (newRetry > MAX_RETRIES) { // send task to dlq
        console.error(JSON.stringify({ taskId, message: 'Max retries exceeded' }));
        // could also remove native redrive completely and manually enqueue to dlq
        throw new Error(`Task ${taskId} failed after ${retryCount} retries`);
      }

      // exponential backoff
      const delay = Math.min(Math.pow(2, newRetry), 60); // 1m max delay

      await dynamo.update({
        TableName: TASK_RETRY_TABLE,
        Key: { taskId },
        UpdateExpression: 'SET retryCount = :r',
        ExpressionAttributeValues: { ':r': newRetry }
      }).promise();

      await sqs.sendMessage({ // requeue failed task
        QueueUrl: TASK_QUEUE_URL,
        MessageBody: JSON.stringify({ taskId }),
        DelaySeconds: delay,
      }).promise();

      console.warn(JSON.stringify({ taskId, retryCount: newRetry, message: 'Requeued with backoff' }));
    } else {
      // we didn't fail
      // imaginary task processing here

      console.log(JSON.stringify({ taskId, message: 'Task processed' }));

      await dynamo.delete({
        TableName: TASK_RETRY_TABLE,
        Key: { taskId }
      }).promise();
    }
  }
};

export const monitorDLQ: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const { taskId } = JSON.parse(record.body);

    const res = await dynamo.get({
      TableName: TASK_RETRY_TABLE,
      Key: { taskId }
    }).promise();

    const item = res.Item;

    if (item) { // we can't really not have the item in db at this point, but just in case
      await dynamo.delete({ TableName: TASK_RETRY_TABLE, Key: { taskId } }).promise();
    }

    console.warn(JSON.stringify({
      level: 'warn',
      message: 'Task in DLQ',
      taskId,
      payload: item?.payload || null,
      retryCount: item?.retryCount || NaN,
    }));

  }
};
