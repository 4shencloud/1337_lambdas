import { SQS } from 'aws-sdk';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSHandler,
} from 'aws-lambda';

const sqs = new SQS();
const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL!;

export const submitTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'No request body' }),
    };
  }

  const { taskId, payload } = JSON.parse(event.body);

  const params: SQS.SendMessageRequest = {
    QueueUrl: TASK_QUEUE_URL,
    MessageBody: JSON.stringify({ taskId, payload }),
  };

  await sqs.sendMessage(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Task submitted', taskId }),
  };
};

export const processTask: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const task = JSON.parse(record.body);
    const fail = Math.random() < 0.3;

    if (fail) {
      console.error(`Task ${task.taskId} failed`);
      throw new Error(`Task ${task.taskId} failed`);
    }

    console.log(`Task ${task.taskId} processed`);
  }
};

export const monitorDLQ: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const task = JSON.parse(record.body);
    console.warn('Task sent to DLQ:', {
      taskId: task.taskId,
      payload: task.payload,
      reason: 'Failed after 2 retries',
    });
  }
};
