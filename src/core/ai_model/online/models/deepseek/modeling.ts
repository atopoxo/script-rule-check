import OpenAI from "openai";
import type { Delta } from '../../../base/ai_types';
import { AIModelOnlineBase } from "../../base/ai_model_online_base";

export class DeepSeek extends AIModelOnlineBase {
    private client: OpenAI;

    constructor(config: any, helper: any) {
        super(config, helper);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.url,
        });
    }

    chatStream(data: any): any {
        return super.chatStream(data);
    }

    async getResponse(moduleName: string, messages: any[], stream: boolean = true, maxTokens: number = 8192): Promise<AsyncIterable<OpenAI.ChatCompletionChunk> | OpenAI.ChatCompletion> {
        return await this.client.chat.completions.create({
            model: moduleName,
            messages: messages,
            max_tokens: maxTokens,
            stream: stream,
        });
    }

    getDelta(chunk: any): Delta {
        const deltaData = chunk.choices[0]?.delta;
        return {
            reasoning: "reasoning_content" in deltaData ? (deltaData as any).reasoning_content : null,
            conclusion: "content" in deltaData ? deltaData.content : null,
        };
    }
}

export function getClass(config: any, helper: any): DeepSeek {
    return new DeepSeek(config, helper);
}