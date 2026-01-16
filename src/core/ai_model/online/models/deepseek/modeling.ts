import OpenAI from "openai";
import { merge } from 'lodash';
import type { Delta } from '../../../base/ai_types';
import { AIModelOnlineBase } from "../../base/ai_model_online_base";

export class DeepSeek extends AIModelOnlineBase {
    private client: OpenAI;
    private toolClient: OpenAI | undefined;

    constructor(config: any, helper: any) {
        super(config, helper);
        const modelConfig = config.model;
        this.client = new OpenAI({
            apiKey: modelConfig.apiKey,
            baseURL: modelConfig.url,
        });
        this.toolClient = undefined;
    }

    public chatStream(signal: AbortSignal, data: any): any {
        return super.chatStream(signal, data);
    }

    public setToolModel(modelConfig: any) {
        this.toolClient = new OpenAI({
            apiKey: modelConfig.apiKey,
            baseURL: modelConfig.url,
        });
    }

    async getResponse(toolModel: boolean, moduleName: string, messages: any[], stream: boolean = true, maxTokens: number = 8192, index: number = -1, extra: any): Promise<AsyncIterable<OpenAI.ChatCompletionChunk> | OpenAI.ChatCompletion> {
        const client = toolModel ? this.toolClient! : this.client;
        let params: any = {
            model: moduleName,
            messages: messages.slice(0, index + 1),
            max_tokens: maxTokens,
            stream: stream
        };
        if (extra) {
            params = merge({}, params, extra);
        }
        return await client.chat.completions.create(params);
    }

    async getToolResponse(toolModel: boolean, moduleName: string, messages: any[], stream: boolean = true, maxTokens: number = 8192, index: number = -1, extra: any): Promise<AsyncIterable<OpenAI.ChatCompletionChunk> | OpenAI.ChatCompletion> {
        const client = toolModel ? this.toolClient! : this.client;
        let filteredMessages: any[] = [];
        if (messages.length >= 1) {
            let lastUserMessage = null;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessage = messages[i];
                    break;
                }
            }
            if (lastUserMessage) {
                filteredMessages = [messages[0], lastUserMessage];
            }
        }
        let params: any = {
            model: moduleName,
            messages: filteredMessages,
            max_tokens: maxTokens,
            stream: stream
        };
        if (extra) {
            params = merge({}, params, extra);
        }
        return await client.chat.completions.create(params);
    }

    getDelta(chunk: any): Delta {
        const deltaData = chunk.choices[0]?.delta;
        if (deltaData) {
            return {
                reasoning: "reasoning_content" in deltaData ? (deltaData as any).reasoning_content : undefined,
                conclusion: "content" in deltaData ? deltaData.content : undefined
            };
        } else {
            return {
                reasoning: undefined,
                conclusion: undefined
            };
        }
    }
}

export function getClass(config: any, helper: any): DeepSeek {
    return new DeepSeek(config, helper);
}