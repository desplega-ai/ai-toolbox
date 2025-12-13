import type { IdeaTestInput, SimilarPost } from './types';
import { HN_SQL_API } from '../constants';

function extractKeywords(title: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 's', 't', 'just', 'now', 'show', 'hn', 'ask', 'tell', 'launch',
    'my', 'i', 'we', 'our', 'your', 'it', 'its', 'this', 'that',
  ]);

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  // Return unique words, prioritizing longer ones
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 5);
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);

  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
}

// Escape single quotes for SQL
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

export async function findSimilarPosts(input: IdeaTestInput): Promise<SimilarPost[]> {
  const keywords = extractKeywords(input.title);
  const domain = input.url ? extractDomain(input.url) : null;

  if (keywords.length === 0 && !domain) {
    return [];
  }

  // Build WHERE clause for keyword matching with escaped values
  const keywordConditions = keywords
    .map(k => `title ILIKE '%${escapeSql(k)}%'`)
    .join(' OR ');

  const domainCondition = domain
    ? `OR url ILIKE '%${escapeSql(domain)}%'`
    : '';

  const sql = `
    SELECT
      title,
      score,
      descendants as comments,
      "by" as author,
      time,
      url
    FROM hn
    WHERE type = 'story'
      AND score IS NOT NULL
      AND score > 0
      AND (${keywordConditions || '1=0'} ${domainCondition})
    ORDER BY RANDOM()
    LIMIT 20
  `;

  try {
    const response = await fetch(`${HN_SQL_API}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit: 20 }),
    });

    if (!response.ok) {
      console.error('Similar posts query failed:', await response.text());
      return [];
    }

    const data = await response.json();

    // Map columns to objects
    const colMap = new Map(data.columns.map((c: string, i: number) => [c, i]));

    return data.rows.map((row: unknown[]): SimilarPost => {
      const title = row[colMap.get('title') as number] as string;
      const rowUrl = row[colMap.get('url') as number] as string | null;
      const rowDomain = rowUrl ? extractDomain(rowUrl) : null;

      // Determine similarity reason
      let similarityReason = 'Similar topic';
      if (domain && rowDomain === domain) {
        similarityReason = 'Same domain';
      } else {
        const matchedKeywords = keywords.filter(k =>
          title.toLowerCase().includes(k.toLowerCase())
        );
        if (matchedKeywords.length > 0) {
          similarityReason = `Keywords: ${matchedKeywords.join(', ')}`;
        }
      }

      return {
        title,
        score: row[colMap.get('score') as number] as number,
        comments: (row[colMap.get('comments') as number] as number) || 0,
        author: row[colMap.get('author') as number] as string,
        timeAgo: formatTimeAgo(row[colMap.get('time') as number] as number),
        url: rowUrl || undefined,
        similarityReason,
      };
    }).slice(0, 10); // Return top 10
  } catch (error) {
    console.error('Error finding similar posts:', error);
    return [];
  }
}
