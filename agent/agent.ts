import { Plugin, PluginResult, ReactAgentResult } from '@/types/agent';

import { DebugCallbackHandler, stripQuotes } from './agentUtil';
import { TaskExecutionContext } from './plugins/executor';
import { listToolsBySpecifiedPlugins } from './plugins/list';
import prompts from './prompts/agent';

import chalk from 'chalk';
import { CallbackManager } from 'langchain/callbacks';
import { PromptTemplate } from 'langchain/prompts';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';

export const executeNotConversationalReactAgent = async (
  context: TaskExecutionContext,
  enabledToolNames: string[],
  input: string,
  pluginResults: PluginResult[],
  verbose: boolean = false,
): Promise<ReactAgentResult> => {
  const callbackManager = new CallbackManager();
  if (verbose) {
    const handler = new DebugCallbackHandler();
    callbackManager.addHandler(handler);
  }

  const sytemPrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.systemPrefix +
      '\n\n' +
      prompts.systemPrompt +
      '\n\n' +
      prompts.systemSuffix,
  );

  const userPrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.userPrompt,
  );

  let agentScratchpad = '';
  if (pluginResults.length > 0) {
    agentScratchpad += `This was your previous work (but I haven't seen any of it! I only see what you return as final answer):\n`;
    for (const actionResult of pluginResults) {
      let observation = actionResult.result;
      if (observation.split('\n').length > 5) {
        observation = `"""\n${observation}\n"""`;
      }
      agentScratchpad += `Thought: ${actionResult.action.thought}
Action: ${actionResult.action.plugin.nameForModel}
Action Input: ${actionResult.action.pluginInput}
Observation: ${observation}\n`;
    }
  }
  agentScratchpad += '';

  const tools = await listToolsBySpecifiedPlugins(context, enabledToolNames);
  const toolDescriptions = tools
    .map((tool) => tool.nameForModel + ': ' + tool.descriptionForModel)
    .join('\n');
  const toolNames = tools.map((tool) => tool.nameForModel).join(', ');

  const systemContent = await sytemPrompt.format({
    locale: context.locale,
    tool_descriptions: toolDescriptions,
    tool_names: toolNames,
  });
  const userContent = await userPrompt.format({
    input,
    agent_scratchpad: agentScratchpad,
  });
  const openai = new OpenAIApi(new Configuration({ apiKey: context.apiKey }));
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];

  const start = Date.now();
  if (verbose) {
    console.log(chalk.greenBright('LLM Request:'));
    for (const message of messages) {
      console.log(chalk.blue(message.role + ': ') + message.content);
    }
    console.log('');
  }

  const result = await openai.createChatCompletion({
    model: context.model?.id || 'gpt-3.5-turbo',
    messages,
    temperature: 0.0,
    stop: ['\nObservation:'],
  });

  const responseText = result.data.choices[0].message?.content;
  const ellapsed = Date.now() - start;
  if (verbose) {
    console.log(chalk.greenBright('LLM Response:'));
    console.log(`ellapsed: ${ellapsed / 1000} sec.`);
    console.log(responseText);
    console.log('');
  }
  const output = parseResult(tools, responseText!);
  return output;
};

export const parseResult = (
  tools: Plugin[],
  result: string,
): ReactAgentResult => {
  const matchAnswer = result.match(/Final Answer:(.*)/);
  const answer = matchAnswer ? matchAnswer[1] : '';
  const answerResult: ReactAgentResult = {
    type: 'answer',
    answer: answer.trim(),
  };

  // if the positivity is high enough, return the answer
  const matchPositivity = result.match(/\nPositivity:(.*)/);
  if (matchPositivity && parseFloat(matchPositivity[1].trim()) >= 9) {
    if (answer) {
      return answerResult;
    }
  }

  const matchThought = result.match(/Thought:(.*)\nAction:/);
  let thought = '';
  if (matchThought) {
    thought = matchThought[1] || '';
  }
  const matchAction = result.match(/Action:(.*)(\n|$)/);
  let action = '';
  if (thought && matchAction) {
    const actionStr = matchAction[1];
    action = stripQuotes(actionStr.trim());
  }
  if (thought && action && action.indexOf('None') === -1) {
    const tool = tools.find((t) => t.nameForModel === action);
    if (!tool) {
      const error = new Error(`Tool ${action} not found`);
      if (answer) {
        // return the answer if already has for better experience.
        return answerResult;
      } else {
        throw error;
      }
    }
    const matchActionInput = result.match(/Action Input: (.*)(\n|$)/);
    const toolInputStr = matchActionInput
      ? (matchActionInput[1] as string)
      : '';
    const toolInput = stripQuotes(toolInputStr.trim());
    return {
      type: 'action',
      thought: thought.trim(),
      plugin: {
        nameForModel: tool.nameForModel,
        nameForHuman: tool.nameForHuman,
        descriptionForHuman: tool.descriptionForHuman,
        descriptionForModel: tool.descriptionForModel,
        logoUrl: tool.logoUrl,
        displayForUser: tool.displayForUser,
      },
      pluginInput: toolInput,
    };
  }
  return answerResult;
};
