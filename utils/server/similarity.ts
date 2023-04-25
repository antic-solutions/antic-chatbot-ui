import { Configuration, OpenAIApi } from 'openai';

export const createEmbedding = async (
  text: string,
  apiKey?: string,
): Promise<number[]> => {
  const openai = new OpenAIApi(
    new Configuration({
      apiKey,
    }),
  );
  const result = await openai.createEmbedding({
    model: 'text-embedding-ada-002',
    input: text,
  });
  return result.data.data[0].embedding;
};

export function calcCosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((acc, v, i) => acc + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
  const normB = Math.sqrt(b.reduce((acc, v) => acc + v * v, 0));
  return dot / (normA * normB);
}
