import { singleton } from "tsyringe";
import axios, { AxiosResponse } from 'axios';
import * as he from 'he';
import * as querystring from 'querystring';
import * as iconv from 'iconv-lite';
import { getJsonParser } from '../../json/json_parser';
import { getFileContent } from '../../function/base_function';

class BrowserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrowserError';
    }
}

interface SearchResultItem {
    title: string;
    snippet: string;
    link: string;
    score: number;
}

interface SearchResult {
    ai_data: string | null;
}

@singleton()
export class Browser {
    private apiKey: string;
    private engineId: string;
    private baseUrl: string;
    private jsonParser = getJsonParser();

    constructor(config: any) {
        this.apiKey = config.GOOGLE_API_KEY;
        this.engineId = config.CUSTOM_SEARCH_ENGINE_ID;
        this.baseUrl = config.GOOGLE_BASE_URL;
    }

    async search(query: string, numResults: number = 10): Promise<SearchResult> {
        const headers = { "Content-Type": "application/json;charset=UTF-8" };
        const params = {
            key: this.apiKey,
            cx: this.engineId,
            lr: "lang_zh-CN",
            gl: "cn",
            safe: "off",
            q: query,
            num: numResults,
            start: 0,
        };
        const searchResults: SearchResultItem[] = [];

        for (let startIndex = 0; startIndex < numResults; startIndex += 10) {
            params.num = Math.min(numResults - startIndex, 10);
            params.start = startIndex + 1;
            try {
                const response: AxiosResponse = await axios.get(
                    this.baseUrl,
                    { headers, params, timeout: 10000 }
                );
                if (response.status !== 200) {
                    throw new Error(`HTTP错误: ${response.status}`);
                }
                this.formatResults(searchResults, response.data);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.warn(`搜索请求失败: ${errorMsg}`);
                throw new BrowserError("搜索请求失败");
            }
        }

        return { ai_data: searchResults.length > 0 ? this.jsonParser.toJsonStr(searchResults) : null };
    }

    private formatResults(results: SearchResultItem[], rawData: any): void {
        if (!rawData.items || !Array.isArray(rawData.items)) {
            return;
        }
        for (const item of rawData.items) {
            try {
                const rawSnippet = item.snippet || "";
                const decodedSnippet = this.decodeSnippet(rawSnippet, "无摘要");
                const finalSnippet = this.forceDecode(decodedSnippet);

                results.push({
                    title: he.decode(item.title || "无标题"),
                    snippet: finalSnippet,
                    link: item.link || "",
                    score: this.calculateRelevance(item)
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`结果格式化失败 | 条目: ${this.jsonParser.toJsonStr(item)} | 错误: ${errorMsg}`);
            }
        }
    }

    private decodeSnippet(text: string, defaultValue: string): string {
        if (!text) {
            return defaultValue;
        }

        const maxDecodeDepth = 3;
        let decoded = text.trim();
        try {
            for (let i = 0; i < maxDecodeDepth; i++) {
                const previous = decoded;
                // URL 解码
                if (/%|\+/.test(decoded)) {
                    decoded = querystring.unescape(decoded);
                }
                // HTML 实体解码
                if (/&|<|>/.test(decoded)) {
                    decoded = he.decode(decoded);
                }
                // Unicode 转义处理
                if (/\\u[\dA-Fa-f]{4}/.test(decoded)) {
                    decoded = decoded.replace(/\\u([\dA-Fa-f]{4})/g, 
                        (_, group) => String.fromCharCode(parseInt(group, 16)));
                }
                // 终止条件
                if (decoded === previous) {
                    break;
                }
            }
            return decoded;
        } catch (error) {
            console.error(`Snippet解码失败 | 原始文本: ${text.slice(0, 50)}... | 错误: ${error}`);
            return defaultValue;
        }
    }

    private forceDecode(text: string): string {
        try {
            const buffer = Buffer.from(text);
            const content = getFileContent(undefined, buffer);
            return content;
        } catch (error) {
            return text;
        }
    }

    private calculateRelevance(item: any): number {
        const snippet = item.snippet || "";
        return Math.min(snippet.length / 200, 1.0);
    }
}