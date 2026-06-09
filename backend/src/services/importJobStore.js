import { randomUUID } from 'crypto';

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

const createJob = () => {
  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    progress: 0,
    phase: 'queued',
    message: 'Import queued',
    processed: 0,
    total: 0,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(id, job);
  return job;
};

const updateJob = (id, patch) => {
  const job = jobs.get(id);

  if (!job) {
    return null;
  }

  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
};

const getJob = (id) => jobs.get(id) ?? null;

const purgeOldJobs = () => {
  const cutoff = Date.now() - JOB_TTL_MS;

  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
};

setInterval(purgeOldJobs, 15 * 60 * 1000).unref();

export default {
  createJob,
  updateJob,
  getJob,
};
