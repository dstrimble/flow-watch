const axios = require('axios');

async function pushBatchMetrics({
  gatewayUrl,
  jobName,
  status,
  durationSeconds,
  recordsProcessed,
  partialFailures = 0,
  errorMessage
}) {
  if (!gatewayUrl || !jobName) {
    return;
  }

  const statusCodeMap = {
    failed: 0,
    degraded: 1,
    success: 2
  };
  const normalizedStatus = status || 'success';
  const statusCode = statusCodeMap[normalizedStatus] ?? statusCodeMap.success;
  const sanitizedError = errorMessage ? JSON.stringify(String(errorMessage)) : '""';
  const lines = [
    '# TYPE flow_watch_batch_last_run_success gauge',
    `flow_watch_batch_last_run_success ${normalizedStatus === 'success' ? 1 : 0}`,
    '# TYPE flow_watch_batch_last_run_degraded gauge',
    `flow_watch_batch_last_run_degraded ${normalizedStatus === 'degraded' ? 1 : 0}`,
    '# TYPE flow_watch_batch_last_run_status_code gauge',
    `flow_watch_batch_last_run_status_code ${statusCode}`,
    '# TYPE flow_watch_batch_last_run_timestamp_seconds gauge',
    `flow_watch_batch_last_run_timestamp_seconds ${Math.floor(Date.now() / 1000)}`,
    '# TYPE flow_watch_batch_last_run_duration_seconds gauge',
    `flow_watch_batch_last_run_duration_seconds ${durationSeconds.toFixed(3)}`,
    '# TYPE flow_watch_batch_last_run_records_processed gauge',
    `flow_watch_batch_last_run_records_processed ${recordsProcessed}`,
    '# TYPE flow_watch_batch_last_run_partial_failures gauge',
    `flow_watch_batch_last_run_partial_failures ${partialFailures}`,
    '# TYPE flow_watch_batch_last_run_error_info gauge',
    `flow_watch_batch_last_run_error_info{message=${sanitizedError}} ${normalizedStatus === 'failed' ? 1 : 0}`
  ];

  const targetUrl = `${gatewayUrl.replace(/\/$/, '')}/metrics/job/${encodeURIComponent(jobName)}`;

  try {
    await axios.put(targetUrl, `${lines.join('\n')}\n`, {
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      timeout: 10000
    });
    console.log(`Pushed batch metrics to Pushgateway for job '${jobName}'`);
  } catch (error) {
    console.error(`Failed to push metrics to Pushgateway for '${jobName}': ${error.message}`);
  }
}

module.exports = { pushBatchMetrics };