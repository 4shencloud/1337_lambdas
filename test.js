import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const BASE_URL = process.argv[2];
const NUM_TASKS = 10;

async function submitTasks() {
  const submitted = [];

  for (let i = 0; i < NUM_TASKS; i++) {
    const taskId = `task-${Date.now()}-${i}`;
    const payload = { data: `Task payload ${i}` };

    try {
      const response = await axios.post(BASE_URL, { taskId, payload });
      console.log(`Submitted: ${taskId}`, response.data);
      submitted.push(taskId);
    } catch (err) {
      //
    }
  }

  return submitted;
}

async function showLogs(functionName) {
  console.log(`\n Logs for ${functionName}:\n`);

  try {
    const { stdout, stderr } = await execPromise(`serverless logs -f ${functionName}`);
    // for some reason it outputs to stderr on windows?
    if (!stderr.includes("not in db, skipping")) {
      console.log(stderr);
    }
  } catch (err) {
    console.error(`Error fetching logs for ${functionName}:`, err.message);
  }
}

(async () => {
  await submitTasks();

  console.log('\n Waiting 65 seconds for processing...');
  await new Promise((r) => setTimeout(r, 65 * 1000));

  await showLogs('processTask');
  await showLogs('monitorDLQ');
})();
