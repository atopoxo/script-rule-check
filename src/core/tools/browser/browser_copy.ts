import { singleton } from "tsyringe";
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as http from 'http';
import * as https from 'https';
import * as userAgents from './user_agents.json';
import { BrowserError, BrowserBase } from './browser_base';
import type { SearchResultItem } from './browser_base';

const SEARXNG_INSTANCES = [
  'https://search.garudalinux.org',
  'https://searx.tiekoetter.com'
];

@singleton()
export class Browser extends BrowserBase {
    // private synonymMap: Record<string, string[]> = {};
    // private wordNet: any;
    private ddgs: any;
    private agent: any;

    constructor(config: any) {
        super();
        // this.wordNet = require('wordnet');
        this.ddgs = require('duckduckgo-search');
        this.agent = new SocksProxyAgent('socks5://your.proxy:1080');
    }

    public async search(query: string, domain: string, numResults: number = 10): Promise<any> {
        const domainOptimizedQuery = this.domainSpecificSearch(query, domain);
        const optimizedQuery = await this.optimizeQuery(domainOptimizedQuery);
        const searchResults: SearchResultItem[] = [];
        
        const engines = [
            // this.searchGoogle.bind(this),
            // this.searchBing.bind(this),
            // this.searchDuckDuckGo.bind(this),
            this.searchXNG.bind(this)
        ];

        for (const engine of engines) {
            try {
                const results = await engine(optimizedQuery, numResults - searchResults.length);
                searchResults.push(...results);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.warn(`搜索引擎失败: ${errorMsg}`);
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

    // private async searchGoogle(query: string, numResults: number): Promise<SearchResultItem[]> {
    //     const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}&hl=zh-CN`;
    //     try {
    //         const response = await this.makeBrowserLikeRequest(url);
    //         return this.parseGoogleResults(response.data);
    //     } catch (error) {
    //         return this.searchWithProxy(url, this.parseGoogleResults);
    //     }
    // }

    // private async searchBing(query: string, numResults: number): Promise<SearchResultItem[]> {
    //     const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
    //     try {
    //         const response = await this.makeBrowserLikeRequest(url);
    //         return this.parseBingResults(response.data);
    //     } catch (error) {
    //         return this.searchWithProxy(url, this.parseBingResults);
    //     }
    // }

    // private async searchDuckDuckGo(query: string, numResults: number): Promise<SearchResultItem[]> {
    //     // const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    //     const results: SearchResultItem[] = [];
    //     try {
    //         // const response = await this.makeBrowserLikeRequest(url);
            
    //         // const response = await this.ddgs.text(query, {
    //         //     region: 'cn-zh',
    //         //     safesearch: 'off'
    //         // });
    //         let count = 0;
    //         for await (const item of this.ddgs.text(query, {
    //             region: 'cn-zh',
    //             safesearch: 'off'
    //         })) {
    //             if (count >= numResults) {
    //                 break;
    //             }
    //             const authorityData = this.calculateAuthority(item.url);
    //             results.push({
    //                 title: this.forceDecode(item.title),
    //                 snippet: this.forceDecode(item.description),
    //                 link: item.url,
    //                 authority: authorityData.name,
    //                 score: 0,
    //                 authorityScore: authorityData.score
    //             });
    //         }
    //         // return this.parseDuckDuckGoResults(result);
    //     } catch (error) {
    //         console.error('DuckDuckGo 搜索失败:', error);
    //     } finally {
    //         return results;
    //     }
    // }

    private async searchXNG(query: string, numResults: number): Promise<SearchResultItem[]> {
        let results: SearchResultItem[] = [];
        try {
            const instanceIndex = 0;
            const instance = SEARXNG_INSTANCES[instanceIndex % SEARXNG_INSTANCES.length];
            const response = await axios.get(`${instance}/search`, {
                params: {
                    q: 'test',
                    format: 'json'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                    'Accept': 'ext/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Sec-CH-UA': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                    'Cookie': 'session=.eJw1zE0LgjAcgPGvEv-zg81MQ-iQkFEQsUQFL7E3c2kzZDuU-N3bpdvv8PDMcH-r6cWMMhZSOzkVAHO2-1uMptUPSOclgF59PGDFIYUyz0dlssv1uBnpsMe3sIrrIe9Kkl2lJrjwAe1tw57ngmtyqIbmROuOii_egX85p6XfEEYwF5FEKuYMRSxsEU94iJK1VExgwrdEwPIDgSE0AQ.aIhoTw.KSFvHJtwtPl-wc9PkTILA297fr8; cf_clearance=cFAIC_96mwcD5jytscrKqG2ySPJDYuzgG.N3mG7bZz8-1753770064-1.2.1.1-Jcl7sDTVNbIbnQ5us.r5et0DxJM_jhLFuIIoneRpAQWeYvb0._bw7_1rbOppAANGfCU79MRgZankQblY7fakN5ioZ2WWSBi14hfQl0Ar8gRF6AoOe74YlxI_eyqxzm_IXEf5Ega8.Pj_6C9OIx5t7Ln1VsQaHKlM4pTGo5DtKO.tkcJdgROJOus8_GaRBbXN1MdzyzHnQaaVDc_WTBSOCHWQt1auL99s2nY0YoCza5Rs_PBf5EqEzZ7sl4MT68J9'
                },
                timeout: 5000,
                maxRedirects: 0
            });
            results = this.parseXNGResults(response.data.results);
        } catch (error) {
            console.error('DuckDuckGo 搜索失败:', error);
        } finally {
            return results;
        }
    }

    // private async makeBrowserLikeRequest(url: string): Promise<AxiosResponse> {
    //     const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    //     const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    //     // await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    //     const secChUa = this.generateSecCHUA(userAgent);
    //     const headers = {
    //         'User-Agent': userAgent,
    //         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    //         'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
    //         'Accept-Encoding': 'gzip, deflate, br, zstd, dcb, dcz',
    //         'Connection': 'keep-alive',
    //         'Upgrade-Insecure-Requests': '1',
    //         'Referer': 'https://www.google.com/',
    //         'X-Forwarded-For': ip,
    //         'Cookie': this.generateRandomCookies(),
    //         'Sec-Fetch-Dest': 'document',
    //         'Sec-Fetch-Mode': 'navigate',
    //         'Sec-Fetch-Site': 'same-origin',
    //         'Sec-Fetch-User': '?1',
    //         'Cache-Control': 'max-age=0',
    //         'DNT': '1',
    //         'Sec-Ch-Ua': secChUa,
    //         'Sec-Ch-Ua-Mobile': '?0',
    //         'Sec-Ch-Ua-Platform': '"Windows"',
    //         'Sec-Ch-Ua-Full-Version-List': secChUa
    //     };
        
    //     return axios.get(url, {});
    // }

    // private generateSecCHUA(userAgent: string): string {
    //     if (userAgent.includes('Chrome')) {
    //         const chromeVersions = [
    //             '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    //         ];
    //         return chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    //     }
    //     return '"Microsoft Edge";v="117", "Not;A=Brand";v="8", "Chromium";v="117"';
    // }

    // private async searchWithProxy<T>(url: string, parser: (html: string) => T): Promise<T> {
    //     const proxies = await this.getAvailableProxies();
    //     for (const proxy of proxies) {
    //         try {
    //             const agent = proxy.startsWith('socks') ? 
    //                 new SocksProxyAgent(proxy) : 
    //                 new HttpsProxyAgent(proxy);
    //             const response = await axios.get(url, {
    //                 httpsAgent: agent,
    //                 httpAgent: agent,
    //                 timeout: 10000,
    //                 headers: {
    //                     'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
    //                 }
    //             });
    //             return parser(response.data);
    //         } catch (error) {
    //             console.warn(`代理 ${proxy} 失败: ${error}`);
    //         }
    //     }
    //     throw new BrowserError("所有代理服务器均失败");
    // }

    // private async getAvailableProxies(): Promise<string[]> {
    //     return [
    //         'http://51.15.242.202:8888',
    //         'socks5://138.197.157.32:1080',
    //         'http://45.77.221.19:3128'
    //     ];
    // }

    // private generateRandomCookies(): string {
    //     // const domains = ['.google.com', '.bing.com', '.duckduckgo.com'];
    //     const domains = ['.google.com'];
    //     const domain = domains[Math.floor(Math.random() * domains.length)];
    //     const cookies = [
    //         `NID=${crypto.randomBytes(16).toString('hex')}; Domain=${domain}; Secure; HttpOnly`,
    //         `1P_JAR=${Math.floor(Date.now()/1000)}; Domain=${domain}; SameSite=none; Secure`,
    //         `CONSENT=YES+CN.zh-CN+${crypto.randomBytes(4).toString('hex')}; Domain=${domain}; Path=/; Secure`,
    //         `SOCS=${this.generateSOCSCookie()}; Domain=${domain}; Path=/; Secure; SameSite=lax`
    //     ];
    //     return cookies.join('; ');
    // }

    // private generateSOCSCookie(): string {
    //     const date = new Date();
    //     date.setFullYear(date.getFullYear() + 1);
    //     const expiry = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    //     return `CAESHAgBEhBnd3NfMjAyNDA1MDkyMDQ5GgVjbj16aCByZWdpb249Y24%3D`;
    // }

    // private parseGoogleResults(html: string): SearchResultItem[] {
    //     const dom = new JSDOM(html);
    //     const doc = dom.window.document;
    //     const results: SearchResultItem[] = [];
        
    //     const resultBlocks = doc.querySelectorAll('div.g');
    //     for (const block of resultBlocks) {
    //         try {
    //             const titleElement = block.querySelector('h3') as HTMLHeadingElement;
    //             const linkElement = block.querySelector('a') as HTMLAnchorElement;
    //             const snippetElement = block.querySelector('.VwiC3b') as HTMLDivElement;
    //             if (!titleElement || !linkElement) {
    //                 continue;
    //             }
    //             const title = titleElement.textContent || '';
    //             const link = linkElement.href;
    //             const snippet = snippetElement?.textContent || '';
    //             const authorityData = this.calculateAuthority(link);
                
    //             results.push({
    //                 title: this.forceDecode(title),
    //                 snippet: this.forceDecode(snippet),
    //                 link,
    //                 authority: authorityData.name,
    //                 score: 0,
    //                 authorityScore: authorityData.score
    //             });
    //         } catch (error) {
    //             console.warn('解析Google结果失败:', error);
    //         }
    //     }
    //     return results;
    // }

    // private parseBingResults(html: string): SearchResultItem[] {
    //     const $ = cheerio.load(html);
    //     const results: SearchResultItem[] = [];
    //     $('.b_algo').each((i, el) => {
    //         try {
    //             const title = $(el).find('h2').text().trim();
    //             const snippet = $(el).find('.b_caption p').text().trim();
    //             const link = $(el).find('h2 a').attr('href');
    //             if (!title || !link) {
    //                 return;
    //             }
    //             const authorityData = this.calculateAuthority(link);
                
    //             results.push({
    //                 title: this.forceDecode(title),
    //                 snippet: this.forceDecode(snippet),
    //                 link,
    //                 authority: authorityData.name,
    //                 score: 0,
    //                 authorityScore: authorityData.score
    //             });
    //         } catch (error) {
    //             console.warn('解析Bing结果失败:', error);
    //         }
    //     });
    //     return results;
    // }

    // private parseDuckDuckGoResults(results: any[]): SearchResultItem[] {
    //     return results.map(item => {
    //         const authorityData = this.calculateAuthority(item.url);
    //         return {
    //             title: this.forceDecode(item.title),
    //             snippet: this.forceDecode(item.description),
    //             link: item.url,
    //             authority: authorityData.name,
    //             score: 0,
    //             authorityScore: authorityData.score
    //         };
    //     });
    // }

    // private addDuckResult(topic: any, results: SearchResultItem[]) {
    //     if (!topic.Text || !topic.FirstURL) {
    //         return;
    //     }
    //     const authorityData = this.calculateAuthority(topic.FirstURL);
    //     results.push({
    //         title: this.forceDecode(topic.Text.split(' - ')[0]),
    //         snippet: this.forceDecode(topic.Text),
    //         link: topic.FirstURL,
    //         authority: authorityData.name,
    //         score: 0,
    //         authorityScore: authorityData.score
    //     });
    // }

    private parseXNGResults(results: any[]): SearchResultItem[] {
        return results.filter(item => item.url && !item.url.includes('pdf') && item.title)
            .map(item => {
            const authorityData = this.calculateAuthority(item.url);
            return {
                title: this.forceDecode(item.title),
                snippet: this.forceDecode(item.description),
                link: item.url,
                authority: authorityData.name,
                score: 0,
                authorityScore: authorityData.score
            };
        });
    }
}