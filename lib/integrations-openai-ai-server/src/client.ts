import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY must be set. Add your OpenAI API key as a secret.",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
