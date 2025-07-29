import { singleton } from "tsyringe";
import axios, { AxiosResponse } from 'axios';
import * as he from 'he';
import { getJsonParser } from '../../json/json_parser';
import { getGlobalConfigValue } from '../../function/base_function';
import { BrowserError, BrowserBase } from './browser_base';
import type { SearchResultItem } from './browser_base';

@singleton()
export class Browser extends BrowserBase {
    private jsonParser = getJsonParser();
    private extensionName: string;
    // private synonymMap: Record<string, string[]> = {};
    // private wordNet: any;

    constructor(config: any) {
        super();
        this.extensionName = config.extensionName;
        // this.wordNet = require('wordnet');
    }

    public async search(query: string, domain: string, numResults: number = 10): Promise<any> {
        const info = this.getConfig();
        const engineId = info.engineId;
        const baseUrl = info.url;
        const apiKey = info.apiKey;
        const headers = { 
            "Content-Type": "application/json;charset=UTF-8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        };
        const domainOptimizedQuery = this.domainSpecificSearch(query, domain);
        const optimizedQuery = await this.optimizeQuery(domainOptimizedQuery);
        const params = {
            key: apiKey,
            cx: engineId,
            lr: "lang_zh-CN",
            gl: "cn",
            safe: "off",
            q: optimizedQuery,
            num: numResults,
            start: 0,
        };
        const searchResults: SearchResultItem[] = [];

        for (let startIndex = 0; startIndex < numResults; startIndex += 10) {
            params.num = Math.min(numResults - startIndex, 10);
            params.start = startIndex + 1;
            try {
                const response: AxiosResponse = await axios.get(baseUrl,
                    { headers, params, timeout: 10000 }
                );
                if (response.status !== 200) {
                    throw new Error(`HTTP错误: ${response.status}`);
                }
                this.formatResults(searchResults, response.data, query);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.warn(`搜索请求失败: ${errorMsg}`);
                throw new BrowserError("搜索请求失败");
            }
        }
        const reorderedResults = await this.semanticReranking(searchResults, query);
        const filteredResults = reorderedResults.filter(item => 
            item.score >= 0.4 &&  // 过滤低相关性结果
            !item.link.includes("pdf") &&  // 排除PDF链接
            !item.title.includes("404") &&  // 排除404页面
            item.snippet.length > 30  // 排除过短摘要
        ).slice(0, numResults);

        return { ai_data: filteredResults };
    }

    private getConfig(): any {
        const id = getGlobalConfigValue<string>(this.extensionName, 'selectedSearchEngine', '');
        const infos = getGlobalConfigValue<any[]>(this.extensionName, 'searchEngineInfos', []) || [];
        const info = infos.find(info => info.id === id) || {name: ''};
        return info
    }

    // private async expandSynonyms(word: string): Promise<string[]> {
    //     try {
    //         await this.wordNet.init();
    //         const results = await this.wordNet.list(`%${word}%`, 'syn');
    //         const synonyms = new Set<string>();
            
    //         results.forEach((result: any) => {
    //             const synset = result.synonyms || result.words || [];
    //             synset.forEach((syn: string) => {
    //                 const normalized = syn.trim().toLowerCase();
    //                 if (normalized !== word && !normalized.includes(' ') && normalized.length > 1) {
    //                     synonyms.add(normalized);
    //                 }
    //             });
    //         });
            
    //         return Array.from(synonyms).slice(0, 5);
    //     } catch (error) {
    //         console.error(`同义词扩展失败: ${error}`);
    //         return [];
    //     }
    // }

    // private detectEntities(text: string): string[] {
    //     // 简单实体识别 - 实际应用可用NER模型
    //     const programmingTerms = [
    //         'api', 'sdk', 'framework', 'library', 'package', 
    //         'function', 'class', 'object', 'variable', 'loop',
    //         'react', 'vue', 'angular', 'django', 'flask'
    //     ];
        
    //     const financeTerms = [
    //         'dividend', 'yield', 'portfolio', 'asset', 'liability',
    //         'equity', 'derivative', 'option', 'future', 'forex'
    //     ];
        
    //     const words = text.toLowerCase().split(/\s+/);
    //     return [
    //         ...programmingTerms.filter(term => words.includes(term)),
    //         ...financeTerms.filter(term => words.includes(term))
    //     ];
    // }

    private formatResults(results: SearchResultItem[], rawData: any, query: string): void {
        if (!rawData.items || !Array.isArray(rawData.items)) {
            return;
        }
        for (const item of rawData.items) {
            try {
                const rawSnippet = item.snippet || "";
                const decodedSnippet = this.decodeSnippet(rawSnippet, "无摘要");
                const finalSnippet = this.generateContextualSnippet(decodedSnippet, query);
                const title = this.decodeSnippet(item.title, "无标题");
                const link = item.link || "";
                const authorityData = this.calculateAuthority(link);

                results.push({
                    title: title,
                    snippet: finalSnippet,
                    link: link,
                    authority: authorityData.name,
                    score: 0, // 临时分数，后续计算
                    authorityScore: authorityData.score
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
        try {
            return he.decode(text);
        } catch (error) {
            console.error(`Snippet解码失败 | 原始文本: ${text.slice(0, 50)}... | 错误: ${error}`);
            return defaultValue;
        }
    }

    private generateContextualSnippet(snippet: string, query: string): string {
        const sentences = snippet.split(/[.!?。！？]\s+/);
        const keywords = this.segmenter.segment(query.toLowerCase());
        let bestSentence = '';
        let maxCount = 0;
        for (const sentence of sentences) {
            const lowerSentence = sentence.toLowerCase();
            let count = 0;
            for (const keyword of keywords) {
                if (lowerSentence.includes(keyword)) {
                    count++;
                }
            }
            if (count > maxCount) {
                maxCount = count;
                bestSentence = sentence;
            }
        }
        return bestSentence || snippet.substring(0, 150) + (snippet.length > 150 ? '...' : '');
    }
}