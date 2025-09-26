import { TextSegmenter } from '../../../core/function/text_segmenter';

export class BrowserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrowserError';
    }
}

export interface SearchResultItem {
    title: string;
    snippet: string;
    link: string;
    authority: string;
    score: number;
    authorityScore: number;
}

export class BrowserBase {
    protected segmenter: TextSegmenter;
    protected domainAuthorities: Record<string, string[]> = {
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

    constructor() {
        this.segmenter = new TextSegmenter();
    }

    protected domainSpecificSearch(query: string, domain: string): string {
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

    protected detectSearchDomain(domain: string) {
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

    protected async optimizeQuery(query: string, year: number = 1): Promise<string> {
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
        // return `${boostedQuery} ${fileTypeExclusions.join(' ')}`;
        return `${boostedQuery}`;
    }

    protected calculateAuthority(link: string): any {
        const result = {
            name: '',
            score: 0
        };
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

    protected async semanticReranking(results: SearchResultItem[], query: string): Promise<SearchResultItem[]> {
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

    protected calculateTextSimilarity(query: string, queryKeywords: string[], content: string): number {
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

        const result = jaccardScore * 0.3 + bm25Score * 0.4 + editDistanceScore * 0.1 + coverageScore * 0.2;
        return result;
    }

    protected forceDecode(text: string): string {
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

    protected levenshteinDistance(a: string, b: string): number {
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

    protected calculateRelevance(query: string, title: string, snippet: string, link: string, authorityScore: number): number {
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

    protected bm25PlusScore(text: string, querySet: Set<string>): number {
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

    protected calculateLinkScore(link: string, querySet: Set<string>): number {
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