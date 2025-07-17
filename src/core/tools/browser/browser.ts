import { singleton } from "tsyringe";
import axios, { AxiosResponse } from 'axios';
import * as he from 'he';
import { getJsonParser } from '../../json/json_parser';
import { getGlobalConfigValue } from '../../function/base_function';
import { TextSegmenter } from '../../function/text_segmenter';

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
    authority: string;
    score: number;
    authorityScore: number;
}

@singleton()
export class Browser {
    private jsonParser = getJsonParser();
    private extensionName: string;
    private segmenter: TextSegmenter;
    // private synonymMap: Record<string, string[]> = {};
    private domainAuthorities: Record<string, string[]> = {
        programming: [
            'github.com', 'stackoverflow.com', 'developer.mozilla.org', 
            'docs.microsoft.com', 'python.org', 'nodejs.org', 'reactjs.org',
            'vuejs.org', 'angular.io', 'docker.com', 'kubernetes.io'
        ],
        finance: [
            'bloomberg.com', 'reuters.com', 'investopedia.com', 
            'sec.gov', 'finra.org', 'nasdaq.com', 'nyse.com',
            'federalreserve.gov', 'imf.org', 'worldbank.org'
        ],
        medical: [
            'who.int', 'cdc.gov', 'nih.gov', 'webmd.com', 'mayoclinic.org',
            'healthline.com', 'medscape.com', 'nejm.org'
        ]
    };
    // private wordNet: any;

    constructor(config: any) {
        this.extensionName = config.extensionName;
        this.segmenter = new TextSegmenter();
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

    private domainSpecificSearch(query: string, domain: string): string {
        const finalDomain = this.detectSearchDomain(domain);
        if (!finalDomain) {
            return query;
        }
        const sites = this.domainAuthorities[finalDomain];
        if (sites.length === 0) {
            return query;
        }
        const selectedSites = [];
        const shuffled = [...sites].sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(3, shuffled.length); i++) {
            selectedSites.push(`site:${shuffled[i]}`);
        }
        return `(${query}) (${selectedSites.join(' OR ')})`;
    }

    private detectSearchDomain(domain: string) {
        let result;
        switch(domain) {
            case 'programming':
            case 'finance':
            case 'medical':
                result = domain;
                break;
            default:
                result = null;
                break;
        }
        return result;
    }

    private async optimizeQuery(query: string, year: number = 1): Promise<string> {
        // const stopWords = ["的", "了", "和", "呢", "啊", "吧", "哦"];
        // let words = query.split(/\s+/).filter(word => 
        //     word.trim() && !stopWords.includes(word.trim())
        // );
        // const keywords = this.segmenter.segment(query.toLowerCase());
        // const expandedWords = await Promise.all(
        //     words.map(async word => {
        //         if (this.synonymMap[word]) {
        //             return [word, ...this.synonymMap[word]];
        //         }
                
        //         try {
        //             const synonyms = await this.expandSynonyms(word);
        //             return [word, ...synonyms];
        //         } catch {
        //             return [word];
        //         }
        //     })
        // );
        // words = expandedWords.flat();

        // const entities = this.detectEntities(query);
        // const boostedQuery = words.map(word => {
        //     return entities.includes(word) ? `"${word}"^1.5` : word;
        // }).join(' ');
        const boostedQuery = query;
        const fileTypeExclusions = ["-filetype:pdf", "-filetype:doc", "-filetype:ppt"];
        // const currentYear = new Date().getFullYear();
        // const startYear = currentYear - year;
        // const timeFilter = ` when:${startYear}..${currentYear}`;
        return `${boostedQuery} ${fileTypeExclusions.join(' ')}`;
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

    private calculateAuthority(link: string): any {
        const result = {
            name: '',
            score: 0
        }
        try {
            const url = new URL(link);
            const domain = url.hostname;
            result.name = domain;
            for (const [_, domains] of Object.entries(this.domainAuthorities)) {
                for (const authDomain of domains) {
                    if (domain.includes(authDomain)) {
                        result.score = 1.0;
                        return result;
                    }
                }
            }
            const govPatterns = ['.gov', '.gov.cn', '.gov.com', '.gov.hk', '.gov.mo', '.gov.tw'];
            const eduPatterns = ['.edu', '.edu.cn', '.edu.com', '.edu.hk', '.edu.mo', '.edu.tw'];
            const isGovDomain = govPatterns.some(suffix => domain.endsWith(suffix));
            const isEduDomain = eduPatterns.some(suffix => domain.endsWith(suffix));
            if (isGovDomain || isEduDomain) {
                result.score = 0.8;
                return result;
            }
            if (domain.includes('wikipedia.org')) {
                result.score = 0.9;
                return result;
            }
            result.score = 0.5;
            return result;
        } catch {
            result.score = 0.5;
            return result;
        }
    }

    private async semanticReranking(results: SearchResultItem[], query: string): Promise<SearchResultItem[]> {
        try {
            const queryKeywords = this.segmenter.segment(query.toLowerCase());
            const scoredResults = await Promise.all(results.map(async (item): Promise<SearchResultItem> => {
                const content = `${item.title} ${item.snippet}`;
                const textScore = this.calculateTextSimilarity(query, queryKeywords, content);
                const traditionalScore = this.calculateRelevance(
                    query, item.title, item.snippet, item.link, item.authorityScore
                );
                const finalScore = (textScore * 0.7) + (traditionalScore * 0.3);
                return {
                    ...item,
                    score: finalScore
                };
            }));
            return scoredResults.sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('语义重排序失败，使用基础排序', error);
            return results.map(item => ({
                ...item,
                score: this.calculateRelevance(query, item.title, item.snippet, item.link, item.authorityScore)
            })).sort((a, b) => b.score - a.score);
        }
    }

    private calculateTextSimilarity(query: string, queryKeywords: string[], content: string): number {
        const contentKeywords = this.segmenter.segment(content.toLowerCase());

        const intersection = new Set(queryKeywords.filter(kw => contentKeywords.includes(kw)));
        const union = new Set([...queryKeywords, ...contentKeywords]);
        const jaccardScore = union.size > 0 ? intersection.size / union.size : 0;

        const bm25Score = this.bm25PlusScore(content, new Set(queryKeywords));

        let editDistanceScore = 0;
        if (query.length < 50) {
            const maxLen = Math.max(query.length, content.length);
            const distance = this.levenshteinDistance(query, content.substring(0, maxLen));
            editDistanceScore = 1 - (distance / maxLen);
        }

        const coverageScore = queryKeywords.filter(kw => content.includes(kw)).length / queryKeywords.length;

        const result = jaccardScore * 0.3 + bm25Score * 0.4 + editDistanceScore * 0.1 + coverageScore * 0.2
        return result;
    }

    private levenshteinDistance(a: string, b: string): number {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) {
            matrix[0][i] = i;
        }
        for (let j = 0; j <= b.length; j++) {
            matrix[j][0] = j;
        }
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }
        return matrix[b.length][a.length];
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            return 0;
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] ** 2;
            normB += vecB[i] ** 2;
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private forceDecode(text: string): string {
        try {
            return text
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .replace(/\n{2,}/g, "\n")
                .trim();
        } catch (error) {
            return text;
        }
    }

    private calculateRelevance(query: string, title: string, snippet: string, link: string, authorityScore: number): number {
        if (!query || !title || !snippet) {
            return 0;
        }
        const queryWords = this.segmenter.segment(query.toLowerCase());
        const querySet = new Set<string>(queryWords);

        const titleScore = this.bm25PlusScore(title, querySet);
        const snippetScore = this.bm25PlusScore(snippet, querySet);
        const linkScore = this.calculateLinkScore(link, querySet);
        const combinedScore = 
            (titleScore * 0.4) + 
            (snippetScore * 0.4) + 
            (linkScore * 0.1) +
            (authorityScore * 0.1);
        return Math.min(1.0, combinedScore);
    }

    private bm25PlusScore(text: string, querySet: Set<string>): number {
        const words = this.segmenter.segment(text.toLowerCase());
        const k1 = 1.5; // 可调参数
        const b = 0.75; // 可调参数
        const delta = 1.0; // BM25+ 参数
        
        let score = 0;
        const docLength = words.length;
        const termFrequencyMap = new Map<string, number>();
        for (const word of words) {
            termFrequencyMap.set(word, (termFrequencyMap.get(word) || 0) + 1);
        }
        const avgTermFrequency = words.length > 0 
            ? Array.from(termFrequencyMap.values()).reduce((sum, tf) => sum + tf, 0) / termFrequencyMap.size 
            : 0;
        const lengthRatio = 100;
        for (const term of querySet) {
            const tf = termFrequencyMap.get(term) || 0;
            const idf = tf > 0 && avgTermFrequency > 0 ? Math.log(1 + (tf / avgTermFrequency)) : 0;
            // BM25+ 计算
            const numerator = tf * (k1 + 1);
            const denominator = tf + k1 * (1 - b + b * (docLength / lengthRatio));
            const termScore = idf * (numerator / denominator + delta);
            if (!isNaN(termScore)) {
                score += termScore;
            }
        }
        const normalizedScore = 1 - Math.exp(-score);
        return Math.min(Math.max(normalizedScore, 0), 1);
    }

    private calculateLinkScore(link: string, querySet: Set<string>): number {
        const lowerLink = link.toLowerCase();
        let score = 0;
        const pathKeywords = lowerLink.split('/').slice(3); // 忽略域名部分
        for (const term of querySet) {
            if (pathKeywords.some(kw => kw.includes(term))) {
                score += 0.2;
            }
        }
        return Math.min(1.0, score);
    }
}