// import { singleton } from "tsyringe";
// import axios, { AxiosResponse } from 'axios';
// import * as he from 'he';
// import * as cheerio from 'cheerio';
// import * as crypto from 'crypto';
// import { SocksProxyAgent } from 'socks-proxy-agent';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// import * as http from 'http';
// import * as https from 'https';
// import { JSDOM } from 'jsdom';
// import * as userAgents from './user_agents.json';
// import { getJsonParser } from '../../json/json_parser';
// import { TextSegmenter } from '../../function/text_segmenter';

// class BrowserError extends Error {
//     constructor(message: string) {
//         super(message);
//         this.name = 'BrowserError';
//     }
// }

// interface SearchResultItem {
//     title: string;
//     snippet: string;
//     link: string;
//     authority: string;
//     score: number;
//     authorityScore: number;
// }

// @singleton()
// export class Browser {
//     private jsonParser = getJsonParser();
//     private extensionName: string;
//     private segmenter: TextSegmenter;
//     // private synonymMap: Record<string, string[]> = {};
//     private domainAuthorities: Record<string, string[]> = {
//         programming: [
//             'github.com', 'stackoverflow.com', 'developer.mozilla.org', 
//             'docs.microsoft.com', 'python.org', 'nodejs.org', 'reactjs.org',
//             'vuejs.org', 'angular.io', 'docker.com', 'kubernetes.io'
//         ],
//         finance: [
//             'bloomberg.com', 'reuters.com', 'investopedia.com', 
//             'sec.gov', 'finra.org', 'nasdaq.com', 'nyse.com',
//             'federalreserve.gov', 'imf.org', 'worldbank.org'
//         ],
//         medical: [
//             'who.int', 'cdc.gov', 'nih.gov', 'webmd.com', 'mayoclinic.org',
//             'healthline.com', 'medscape.com', 'nejm.org'
//         ]
//     };
//     // private wordNet: any;

//     constructor(config: any) {
//         this.extensionName = config.extensionName;
//         this.segmenter = new TextSegmenter();
//         // this.wordNet = require('wordnet');
//     }

//     public async search(query: string, domain: string, numResults: number = 10): Promise<any> {
//         const domainOptimizedQuery = this.domainSpecificSearch(query, domain);
//         const optimizedQuery = await this.optimizeQuery(domainOptimizedQuery);
//         const searchResults: SearchResultItem[] = [];
        
//         const engines = [
//             this.searchGoogle.bind(this),
//             this.searchBing.bind(this),
//             this.searchDuckDuckGo.bind(this)
//         ];

//         for (const engine of engines) {
//             try {
//                 const results = await engine(optimizedQuery, numResults - searchResults.length);
//                 searchResults.push(...results);
//             } catch (error) {
//                 const errorMsg = error instanceof Error ? error.message : String(error);
//                 console.warn(`搜索引擎失败: ${errorMsg}`);
//             }
//         }

//         const reorderedResults = await this.semanticReranking(searchResults, query);
//         const filteredResults = reorderedResults.filter(item => 
//             item.score >= 0.4 &&  // 过滤低相关性结果
//             !item.link.includes("pdf") &&  // 排除PDF链接
//             !item.title.includes("404") &&  // 排除404页面
//             item.snippet.length > 30  // 排除过短摘要
//         ).slice(0, numResults);

//         return { ai_data: filteredResults };
//     }

//     private domainSpecificSearch(query: string, domain: string): string {
//         const finalDomain = this.detectSearchDomain(domain);
//         if (!finalDomain) {
//             return query;
//         }
//         const sites = this.domainAuthorities[finalDomain];
//         if (sites.length === 0) {
//             return query;
//         }
//         const selectedSites = [];
//         const shuffled = [...sites].sort(() => 0.5 - Math.random());
//         for (let i = 0; i < Math.min(3, shuffled.length); i++) {
//             selectedSites.push(`site:${shuffled[i]}`);
//         }
//         return `(${query}) (${selectedSites.join(' OR ')})`;
//     }

//     private detectSearchDomain(domain: string) {
//         let result;
//         switch(domain) {
//             case 'programming':
//             case 'finance':
//             case 'medical':
//                 result = domain;
//                 break;
//             default:
//                 result = null;
//                 break;
//         }
//         return result;
//     }

//     private async optimizeQuery(query: string, year: number = 1): Promise<string> {
//         const boostedQuery = query;
//         const fileTypeExclusions = ["-filetype:pdf", "-filetype:doc", "-filetype:ppt"];
//         return `${boostedQuery}`;
//     }

//     private async searchGoogle(query: string, numResults: number): Promise<SearchResultItem[]> {
//         const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}&hl=zh-CN`;
//         try {
//             const response = await this.makeBrowserLikeRequest(url);
//             return this.parseGoogleResults(response.data);
//         } catch (error) {
//             return this.searchWithProxy(url, this.parseGoogleResults);
//         }
//     }

//     private async searchBing(query: string, numResults: number): Promise<SearchResultItem[]> {
//         const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
//         try {
//             const response = await this.makeBrowserLikeRequest(url);
//             return this.parseBingResults(response.data);
//         } catch (error) {
//             return this.searchWithProxy(url, this.parseBingResults);
//         }
//     }

//     private async searchDuckDuckGo(query: string, numResults: number): Promise<SearchResultItem[]> {
//         const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
//         try {
//             const response = await this.makeBrowserLikeRequest(url);
//             return this.parseDuckDuckGoResults(response.data, numResults);
//         } catch (error) {
//             return this.searchWithProxy(url, (html: string) => 
//                 this.parseDuckDuckGoResults(html, numResults));
//         }
//     }

//     private async makeBrowserLikeRequest(url: string): Promise<AxiosResponse> {
//         const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
//         const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
//         // await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
//         const secChUa = this.generateSecCHUA(userAgent);
//         const headers = {
//             'User-Agent': userAgent,
//             'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
//             'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
//             'Accept-Encoding': 'gzip, deflate, br, zstd, dcb, dcz',
//             'Connection': 'keep-alive',
//             'Upgrade-Insecure-Requests': '1',
//             'Referer': 'https://www.google.com/',
//             'X-Forwarded-For': ip,
//             'Cookie': this.generateRandomCookies(),
//             'Sec-Fetch-Dest': 'document',
//             'Sec-Fetch-Mode': 'navigate',
//             'Sec-Fetch-Site': 'same-origin',
//             'Sec-Fetch-User': '?1',
//             'Cache-Control': 'max-age=0',
//             'DNT': '1',
//             'Sec-Ch-Ua': secChUa,
//             'Sec-Ch-Ua-Mobile': '?0',
//             'Sec-Ch-Ua-Platform': '"Windows"',
//             'Sec-Ch-Ua-Full-Version-List': secChUa
//         };
        
//         return axios.get(url, {
//             headers,
//             timeout: 15000,
//             responseType: 'text',
//             // 自动处理重定向
//             maxRedirects: 5,
//             proxy: false,
//             httpAgent: new http.Agent({ 
//                 keepAlive: true,
//                 keepAliveMsecs: 60000
//             }),
//             httpsAgent: new https.Agent({ 
//                 keepAlive: true,
//                 keepAliveMsecs: 60000
//             })
//         });
//     }

//     private generateSecCHUA(userAgent: string): string {
//         if (userAgent.includes('Chrome')) {
//             const chromeVersions = [
//                 '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
//             ];
//             return chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
//         }
//         return '"Microsoft Edge";v="117", "Not;A=Brand";v="8", "Chromium";v="117"';
//     }

//     private async searchWithProxy<T>(url: string, parser: (html: string) => T): Promise<T> {
//         const proxies = await this.getAvailableProxies();
//         for (const proxy of proxies) {
//             try {
//                 const agent = proxy.startsWith('socks') ? 
//                     new SocksProxyAgent(proxy) : 
//                     new HttpsProxyAgent(proxy);
//                 const response = await axios.get(url, {
//                     httpsAgent: agent,
//                     httpAgent: agent,
//                     timeout: 10000,
//                     headers: {
//                         'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
//                     }
//                 });
//                 return parser(response.data);
//             } catch (error) {
//                 console.warn(`代理 ${proxy} 失败: ${error}`);
//             }
//         }
//         throw new BrowserError("所有代理服务器均失败");
//     }

//     private async getAvailableProxies(): Promise<string[]> {
//         return [
//             'http://51.15.242.202:8888',
//             'socks5://138.197.157.32:1080',
//             'http://45.77.221.19:3128'
//         ];
//     }

//     private generateRandomCookies(): string {
//         // const domains = ['.google.com', '.bing.com', '.duckduckgo.com'];
//         const domains = ['.google.com'];
//         const domain = domains[Math.floor(Math.random() * domains.length)];
//         const cookies = [
//             `NID=${crypto.randomBytes(16).toString('hex')}; Domain=${domain}; Secure; HttpOnly`,
//             `1P_JAR=${Math.floor(Date.now()/1000)}; Domain=${domain}; SameSite=none; Secure`,
//             `CONSENT=YES+CN.zh-CN+${crypto.randomBytes(4).toString('hex')}; Domain=${domain}; Path=/; Secure`,
//             `SOCS=${this.generateSOCSCookie()}; Domain=${domain}; Path=/; Secure; SameSite=lax`
//         ];
//         return cookies.join('; ');
//     }

//     private generateSOCSCookie(): string {
//         const date = new Date();
//         date.setFullYear(date.getFullYear() + 1);
//         const expiry = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
//         return `CAESHAgBEhBnd3NfMjAyNDA1MDkyMDQ5GgVjbj16aCByZWdpb249Y24%3D`;
//     }

//     private parseGoogleResults(html: string): SearchResultItem[] {
//         const dom = new JSDOM(html);
//         const doc = dom.window.document;
//         const results: SearchResultItem[] = [];
        
//         const resultBlocks = doc.querySelectorAll('div.g');
//         for (const block of resultBlocks) {
//             try {
//                 const titleElement = block.querySelector('h3') as HTMLHeadingElement;
//                 const linkElement = block.querySelector('a') as HTMLAnchorElement;
//                 const snippetElement = block.querySelector('.VwiC3b') as HTMLDivElement;
//                 if (!titleElement || !linkElement) {
//                     continue;
//                 }
//                 const title = titleElement.textContent || '';
//                 const link = linkElement.href;
//                 const snippet = snippetElement?.textContent || '';
//                 const authorityData = this.calculateAuthority(link);
                
//                 results.push({
//                     title: this.forceDecode(title),
//                     snippet: this.forceDecode(snippet),
//                     link,
//                     authority: authorityData.name,
//                     score: 0,
//                     authorityScore: authorityData.score
//                 });
//             } catch (error) {
//                 console.warn('解析Google结果失败:', error);
//             }
//         }
//         return results;
//     }

//     private parseBingResults(html: string): SearchResultItem[] {
//         const $ = cheerio.load(html);
//         const results: SearchResultItem[] = [];
//         $('.b_algo').each((i, el) => {
//             try {
//                 const title = $(el).find('h2').text().trim();
//                 const snippet = $(el).find('.b_caption p').text().trim();
//                 const link = $(el).find('h2 a').attr('href');
//                 if (!title || !link) {
//                     return;
//                 }
//                 const authorityData = this.calculateAuthority(link);
                
//                 results.push({
//                     title: this.forceDecode(title),
//                     snippet: this.forceDecode(snippet),
//                     link,
//                     authority: authorityData.name,
//                     score: 0,
//                     authorityScore: authorityData.score
//                 });
//             } catch (error) {
//                 console.warn('解析Bing结果失败:', error);
//             }
//         });
//         return results;
//     }

//     private parseDuckDuckGoResults(html: string, maxResults: number): SearchResultItem[] {
//         const $ = cheerio.load(html);
//         const results: SearchResultItem[] = [];
//         $('.result').slice(0, maxResults).each((i, el) => {
//             try {
//                 const title = $(el).find('.result__a').text().trim();
//                 const snippet = $(el).find('.result__snippet').text().trim();
//                 const link = $(el).find('.result__a').attr('href');
//                 if (!title || !link) {
//                     return;
//                 }
//                 const authorityData = this.calculateAuthority(link);
                
//                 results.push({
//                     title: this.forceDecode(title),
//                     snippet: this.forceDecode(snippet),
//                     link,
//                     authority: authorityData.name,
//                     score: 0,
//                     authorityScore: authorityData.score
//                 });
//             } catch (error) {
//                 console.warn('解析DuckDuckGo结果失败:', error);
//             }
//         });
//         return results;
//     }

//     private decodeSnippet(text: string, defaultValue: string): string {
//         if (!text) {
//             return defaultValue;
//         }
//         try {
//             return he.decode(text);
//         } catch (error) {
//             console.error(`Snippet解码失败 | 原始文本: ${text.slice(0, 50)}... | 错误: ${error}`);
//             return defaultValue;
//         }
//     }

//     private generateContextualSnippet(snippet: string, query: string): string {
//         const sentences = snippet.split(/[.!?。！？]\s+/);
//         const keywords = this.segmenter.segment(query.toLowerCase());
//         let bestSentence = '';
//         let maxCount = 0;
//         for (const sentence of sentences) {
//             const lowerSentence = sentence.toLowerCase();
//             let count = 0;
//             for (const keyword of keywords) {
//                 if (lowerSentence.includes(keyword)) {
//                     count++;
//                 }
//             }
//             if (count > maxCount) {
//                 maxCount = count;
//                 bestSentence = sentence;
//             }
//         }
//         return bestSentence || snippet.substring(0, 150) + (snippet.length > 150 ? '...' : '');
//     }

//     private calculateAuthority(link: string): any {
//         const result = {
//             name: '',
//             score: 0
//         }
//         try {
//             const url = new URL(link);
//             const domain = url.hostname;
//             result.name = domain;
//             for (const [_, domains] of Object.entries(this.domainAuthorities)) {
//                 for (const authDomain of domains) {
//                     if (domain.includes(authDomain)) {
//                         result.score = 1.0;
//                         return result;
//                     }
//                 }
//             }
//             const govPatterns = ['.gov', '.gov.cn', '.gov.com', '.gov.hk', '.gov.mo', '.gov.tw'];
//             const eduPatterns = ['.edu', '.edu.cn', '.edu.com', '.edu.hk', '.edu.mo', '.edu.tw'];
//             const isGovDomain = govPatterns.some(suffix => domain.endsWith(suffix));
//             const isEduDomain = eduPatterns.some(suffix => domain.endsWith(suffix));
//             if (isGovDomain || isEduDomain) {
//                 result.score = 0.8;
//                 return result;
//             }
//             if (domain.includes('wikipedia.org')) {
//                 result.score = 0.9;
//                 return result;
//             }
//             result.score = 0.5;
//             return result;
//         } catch {
//             result.score = 0.5;
//             return result;
//         }
//     }

//     private async semanticReranking(results: SearchResultItem[], query: string): Promise<SearchResultItem[]> {
//         try {
//             const queryKeywords = this.segmenter.segment(query.toLowerCase());
//             const scoredResults = await Promise.all(results.map(async (item): Promise<SearchResultItem> => {
//                 const content = `${item.title} ${item.snippet}`;
//                 const textScore = this.calculateTextSimilarity(query, queryKeywords, content);
//                 const traditionalScore = this.calculateRelevance(
//                     query, item.title, item.snippet, item.link, item.authorityScore
//                 );
//                 const finalScore = (textScore * 0.7) + (traditionalScore * 0.3);
//                 return {
//                     ...item,
//                     score: finalScore
//                 };
//             }));
//             return scoredResults.sort((a, b) => b.score - a.score);
//         } catch (error) {
//             console.error('语义重排序失败，使用基础排序', error);
//             return results.map(item => ({
//                 ...item,
//                 score: this.calculateRelevance(query, item.title, item.snippet, item.link, item.authorityScore)
//             })).sort((a, b) => b.score - a.score);
//         }
//     }

//     private calculateTextSimilarity(query: string, queryKeywords: string[], content: string): number {
//         const contentKeywords = this.segmenter.segment(content.toLowerCase());

//         const intersection = new Set(queryKeywords.filter(kw => contentKeywords.includes(kw)));
//         const union = new Set([...queryKeywords, ...contentKeywords]);
//         const jaccardScore = union.size > 0 ? intersection.size / union.size : 0;

//         const bm25Score = this.bm25PlusScore(content, new Set(queryKeywords));

//         let editDistanceScore = 0;
//         if (query.length < 50) {
//             const maxLen = Math.max(query.length, content.length);
//             const distance = this.levenshteinDistance(query, content.substring(0, maxLen));
//             editDistanceScore = 1 - (distance / maxLen);
//         }

//         const coverageScore = queryKeywords.filter(kw => content.includes(kw)).length / queryKeywords.length;

//         const result = jaccardScore * 0.3 + bm25Score * 0.4 + editDistanceScore * 0.1 + coverageScore * 0.2
//         return result;
//     }

//     private levenshteinDistance(a: string, b: string): number {
//         const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
//         for (let i = 0; i <= a.length; i++) {
//             matrix[0][i] = i;
//         }
//         for (let j = 0; j <= b.length; j++) {
//             matrix[j][0] = j;
//         }
//         for (let j = 1; j <= b.length; j++) {
//             for (let i = 1; i <= a.length; i++) {
//                 const cost = a[i - 1] === b[j - 1] ? 0 : 1;
//                 matrix[j][i] = Math.min(
//                     matrix[j][i - 1] + 1,
//                     matrix[j - 1][i] + 1,
//                     matrix[j - 1][i - 1] + cost
//                 );
//             }
//         }
//         return matrix[b.length][a.length];
//     }

//     private forceDecode(text: string): string {
//         try {
//             return text
//                 .replace(/<br\s*\/?>/gi, "\n")
//                 .replace(/<\/p>/gi, "\n")
//                 .replace(/<[^>]+>/g, "")
//                 .replace(/\n{2,}/g, "\n")
//                 .trim();
//         } catch (error) {
//             return text;
//         }
//     }

//     private calculateRelevance(query: string, title: string, snippet: string, link: string, authorityScore: number): number {
//         if (!query || !title || !snippet) {
//             return 0;
//         }
//         const queryWords = this.segmenter.segment(query.toLowerCase());
//         const querySet = new Set<string>(queryWords);

//         const titleScore = this.bm25PlusScore(title, querySet);
//         const snippetScore = this.bm25PlusScore(snippet, querySet);
//         const linkScore = this.calculateLinkScore(link, querySet);
//         const combinedScore = 
//             (titleScore * 0.4) + 
//             (snippetScore * 0.4) + 
//             (linkScore * 0.1) +
//             (authorityScore * 0.1);
//         return Math.min(1.0, combinedScore);
//     }

//     private bm25PlusScore(text: string, querySet: Set<string>): number {
//         const words = this.segmenter.segment(text.toLowerCase());
//         const k1 = 1.5; // 可调参数
//         const b = 0.75; // 可调参数
//         const delta = 1.0; // BM25+ 参数
        
//         let score = 0;
//         const docLength = words.length;
//         const termFrequencyMap = new Map<string, number>();
//         for (const word of words) {
//             termFrequencyMap.set(word, (termFrequencyMap.get(word) || 0) + 1);
//         }
//         const avgTermFrequency = words.length > 0 
//             ? Array.from(termFrequencyMap.values()).reduce((sum, tf) => sum + tf, 0) / termFrequencyMap.size 
//             : 0;
//         const lengthRatio = 100;
//         for (const term of querySet) {
//             const tf = termFrequencyMap.get(term) || 0;
//             const idf = tf > 0 && avgTermFrequency > 0 ? Math.log(1 + (tf / avgTermFrequency)) : 0;
//             // BM25+ 计算
//             const numerator = tf * (k1 + 1);
//             const denominator = tf + k1 * (1 - b + b * (docLength / lengthRatio));
//             const termScore = idf * (numerator / denominator + delta);
//             if (!isNaN(termScore)) {
//                 score += termScore;
//             }
//         }
//         const normalizedScore = 1 - Math.exp(-score);
//         return Math.min(Math.max(normalizedScore, 0), 1);
//     }

//     private calculateLinkScore(link: string, querySet: Set<string>): number {
//         const lowerLink = link.toLowerCase();
//         let score = 0;
//         const pathKeywords = lowerLink.split('/').slice(3); // 忽略域名部分
//         for (const term of querySet) {
//             if (pathKeywords.some(kw => kw.includes(term))) {
//                 score += 0.2;
//             }
//         }
//         return Math.min(1.0, score);
//     }
// }