import { NextApiRequest, NextApiResponse } from 'next';

import { OpenAIError } from '@/utils/server';
import { ensureHasValidSession } from '@/utils/server/auth';
import { getTiktokenEncoding } from '@/utils/server/tiktoken';

import { PlanningRequest, PlanningResponse } from '@/types/agent';

import { executeNotConversationalReactAgent } from '@/agent/agent';
import { createContext } from '@/agent/plugins/executor';
import path from 'node:path';
import { v4 } from 'uuid';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Vercel Hack
  // https://github.com/orgs/vercel/discussions/1278
  // eslint-disable-next-line no-unused-vars
  const vercelFunctionHack = path.resolve('./public', '');

  if (!(await ensureHasValidSession(req, res))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      model,
      key,
      messages,
      enabledToolNames,
      pluginResults: toolActionResults,
    } = req.body as PlanningRequest;

    let { taskId } = req.body;
    if (!taskId) {
      taskId = v4();
    }

    const lastMessage = messages[messages.length - 1];
    const verbose = process.env.DEBUG_AGENT_LLM_LOGGING === 'true';
    const context = createContext(taskId, req, model, verbose, key);
    const result = await executeNotConversationalReactAgent(
      context,
      enabledToolNames,
      lastMessage.content,
      toolActionResults,
      verbose,
    );
    const responseJson = {
      result,
      taskId,
    } as PlanningResponse;
    res.status(200).json(responseJson);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Error' });
    }
  }
};

export default handler;
