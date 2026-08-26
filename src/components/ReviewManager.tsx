import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { aiAuthHeaders } from '../utils/ai';
import { View } from '../types';
import {
  Star, MessageSquare, Bug, Lightbulb, XCircle, Copy, Check,
  ChevronDown, ChevronUp, Loader2, Download, Send, FlaskConical,
} from 'lucide-react';

interface Review {
  id: string;
  store: 'play' | 'apple' | 'other';
  author: string;
  rating: number;
  date: string;
  text: string;
}

interface AnalysisResult {
  bugs: { title: string; severity: 'critical' | 'high' | 'medium' | 'low'; description: string; canFix: boolean; fixSuggestion?: string; screen?: string; userFixable?: boolean; fixSteps?: string }[];
  improvements: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[];
  cantFix: { title: string; reason: string }[];
  replies: { reviewId: string; author: string; reply: string }[];
  summary: string;
}

function parseReviews(raw: string): Review[] {
  // Try to parse pasted review blocks — supports common copy-paste formats
  const reviews: Review[] = [];
  const blocks = raw.split(/\n{2,}/).filter(b => b.trim().length > 10);
  blocks.forEach((block, i) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    // Detect stars ★ or rating numbers
    let rating = 3;
    const starMatch = block.match(/([★✦⭐]+)|(\d)\s*(?:\/\s*5|\s*stars?)/i);
    if (starMatch) {
      if (starMatch[1]) rating = starMatch[1].length;
      else if (starMatch[2]) rating = parseInt(starMatch[2]);
    }
    // Detect author — first line if short
    const author = lines[0].length < 40 && !lines[0].includes(' ') ? lines[0] : `Reviewer ${i + 1}`;
    const text = lines.slice(1).join(' ') || lines[0];
    reviews.push({
      id: `r${i}`,
      store: block.toLowerCase().includes('play') ? 'play' : block.toLowerCase().includes('apple') ? 'apple' : 'other',
      author,
      rating,
      date: new Date().toISOString().slice(0, 10),
      text,
    });
  });
  return reviews;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-50 transition"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const REPRODUCIBLE_VIEWS: View[] = ['dashboard', 'transactions', 'recurring', 'bankimport', 'invoices', 'jobs', 'stock', 'contacts', 'accounts', 'budget', 'payroll', 'vat', 'vatreturn', 'reports', 'annual', 'settings'];

export default function ReviewManager({ setView }: { setView: (v: View) => void }) {
  const { lang, loadSampleData } = useApp();

  // Reproduce a complaint: load realistic sample data, then jump to the screen the AI
  // pinned the bug to — so the reported problem can be seen (and fixed) immediately.
  function reproduce(screen?: string) {
    loadSampleData();
    const v = REPRODUCIBLE_VIEWS.find(x => x === screen);
    if (v) setView(v);
  }
  const [rawText, setRawText] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bugs' | 'improvements' | 'cantfix' | 'replies' | 'report'>('bugs');

  function handleParse() {
    const parsed = parseReviews(rawText);
    setReviews(parsed);
    setAnalysis(null);
    setError('');
  }

  async function handleAnalyze() {
    if (reviews.length === 0) { setError('Parse reviews first.'); return; }

    setLoading(true);
    setError('');

    const prompt = `You are a product manager analyzing app store reviews for "Jobboks" — a PWA accounting and invoicing app for small contractors and trade businesses.

Reviews to analyze:
${reviews.map((r, i) => `[${i + 1}] ${r.author} (${r.rating}/5 stars): "${r.text}"`).join('\n')}

Analyze these reviews and respond with a JSON object (no markdown, just raw JSON) with this structure:
{
  "bugs": [
    {
      "title": "short bug title",
      "severity": "critical|high|medium|low",
      "description": "what users are experiencing",
      "canFix": true,
      "fixSuggestion": "technical suggestion for fixing it",
      "screen": "the app screen where this bug shows, so it can be reproduced — one of: dashboard, transactions, recurring, bankimport, invoices, jobs, stock, contacts, accounts, budget, payroll, vat, vatreturn, reports, annual, settings (omit if unclear)",
      "userFixable": false,
      "fixSteps": "IF this is actually a WRONG SETTING the user can fix themselves (wrong sales-tax rate, wrong currency, wrong invoice prefix, prices-include-tax mismatch — NOT a code bug), set userFixable=true and give the exact plain-words in-app steps here, e.g. 'Open Settings → Sales Tax and set your state's rate (or 0 if your state has no sales tax).' Otherwise omit."
    }
  ],
  "improvements": [
    {
      "title": "improvement title",
      "description": "what users want",
      "priority": "high|medium|low"
    }
  ],
  "cantFix": [
    {
      "title": "item title",
      "reason": "why this cannot be fixed or is out of scope"
    }
  ],
  "replies": [
    {
      "reviewId": "r0",
      "author": "reviewer name",
      "reply": "professional, friendly reply that acknowledges their feedback. IF the problem is something they can fix themselves in the app (a wrong setting), the reply MUST guide them with the exact in-app steps, e.g. 'Good news — you can fix this in seconds: open Settings → Sales Tax and set your state's rate.' IF it's a real bug we must fix, thank them and say a fix is on the way. Keep under 100 words. Sign off as 'The Jobboks Team'."
    }
  ],
  "summary": "3-4 sentence executive summary of the overall review landscape, top pain points, and recommended next steps"
}

Be specific and actionable. For bugs, focus on what developers can actually fix in a React PWA.`;

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The endpoint is signed-in only now — see netlify/functions/_guard.js.
          ...(await aiAuthHeaders()),
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const data2 = await response.json();
      const content = data2.content[0]?.text ?? '';

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not parse AI response');
      const result: AnalysisResult = JSON.parse(jsonMatch[0]);
      setAnalysis(result);
      setActiveTab('bugs');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    if (!analysis) return;
    const lines = [
      'JOBBOKS — APP REVIEW INTELLIGENCE REPORT',
      `Generated: ${new Date().toLocaleString()}`,
      `Reviews analyzed: ${reviews.length}`,
      '',
      '═══════════════════════════════════════',
      'EXECUTIVE SUMMARY',
      '═══════════════════════════════════════',
      analysis.summary,
      '',
      '═══════════════════════════════════════',
      'BUGS IDENTIFIED',
      '═══════════════════════════════════════',
      ...analysis.bugs.map((b, i) =>
        `${i + 1}. [${b.severity.toUpperCase()}] ${b.title}\n   ${b.description}\n   ${b.canFix ? `Fix: ${b.fixSuggestion}` : 'Cannot fix automatically'}`
      ),
      '',
      '═══════════════════════════════════════',
      'IMPROVEMENT RECOMMENDATIONS',
      '═══════════════════════════════════════',
      ...analysis.improvements.map((imp, i) =>
        `${i + 1}. [${imp.priority.toUpperCase()}] ${imp.title}\n   ${imp.description}`
      ),
      '',
      '═══════════════════════════════════════',
      'OUT OF SCOPE / CANNOT FIX',
      '═══════════════════════════════════════',
      ...analysis.cantFix.map((c, i) => `${i + 1}. ${c.title}\n   Reason: ${c.reason}`),
      '',
      '═══════════════════════════════════════',
      'DRAFT REPLIES',
      '═══════════════════════════════════════',
      ...analysis.replies.map(r => `To: ${r.author}\n---\n${r.reply}\n`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobboks_review_report_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const severityColor = (s: string) =>
    s === 'critical' ? 'bg-red-100 text-red-700 border-red-200' :
    s === 'high' ? 'bg-orange-100 text-orange-700 border-orange-200' :
    s === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
    'bg-gray-100 text-gray-600 border-gray-200';

  const priorityColor = (p: string) =>
    p === 'high' ? 'bg-blue-100 text-blue-700' :
    p === 'medium' ? 'bg-purple-100 text-purple-700' :
    'bg-gray-100 text-gray-500';

  const tabs = [
    { id: 'bugs' as const,         label: `🐛 Bugs${analysis ? ` (${analysis.bugs.length})` : ''}` },
    { id: 'improvements' as const, label: `💡 Improvements${analysis ? ` (${analysis.improvements.length})` : ''}` },
    { id: 'cantfix' as const,      label: `❌ Can't Fix${analysis ? ` (${analysis.cantFix.length})` : ''}` },
    { id: 'replies' as const,      label: `💬 Replies${analysis ? ` (${analysis.replies.length})` : ''}` },
    { id: 'report' as const,       label: '📊 Report' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'is' ? 'Umsagnastjórnun' : 'Review Intelligence'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lang === 'is'
              ? 'Greina umsagnir úr App Store og Play Store með gervigreind'
              : 'AI-powered analysis of App Store & Play Store reviews'}
          </p>
        </div>
        {analysis && (
          <button onClick={downloadReport}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <Download className="w-4 h-4" />
            Download Report
          </button>
        )}
      </div>

      {/* Input */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-800 mb-1">Paste Reviews</h2>
        <p className="text-xs text-gray-500 mb-3">
          Copy reviews from <strong>App Store Connect</strong> or <strong>Google Play Console</strong> and paste below.
          Each review should be separated by a blank line. Format: author name on first line, then the review text.
        </p>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          rows={8}
          placeholder={`JohnD\n★★★ Good app but crashes on invoice\nThe app is great for tracking jobs but it crashes every time I try to print an invoice on Android.\n\nSarahM\n★★★★★ Love it!\nFinally an app that works for my plumbing business. Would love to see a mileage tracker added.\n\nContractorBob\n★★ Currency issues\nAmounts still showing in wrong currency after changing settings. Very frustrating.`}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={handleParse}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <MessageSquare className="w-4 h-4" />
            Parse Reviews
          </button>
          <button onClick={handleAnalyze} disabled={loading || reviews.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Analyzing…' : `Analyze with AI${reviews.length > 0 ? ` (${reviews.length} reviews)` : ''}`}
          </button>
        </div>
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
      </div>

      {/* Parsed review preview */}
      {reviews.length > 0 && !analysis && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">{reviews.length} Reviews Parsed</h2>
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {r.author[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800">{r.author}</span>
                    <StarRating rating={r.rating} />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-max px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Bugs tab */}
          {activeTab === 'bugs' && (
            <div className="space-y-3">
              {analysis.bugs.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center text-sm text-green-700">
                  ✅ No bugs identified in these reviews
                </div>
              ) : analysis.bugs.map((bug, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1">
                      <Bug className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{bug.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${severityColor(bug.severity)}`}>
                            {bug.severity}
                          </span>
                          {bug.userFixable ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                              user can self-fix (setting)
                            </span>
                          ) : !bug.canFix && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                              manual fix needed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{bug.description}</p>
                        {bug.userFixable && bug.fixSteps && (
                          <div className="mt-2 bg-green-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-green-800"><span className="font-medium">User can fix it in-app:</span> {bug.fixSteps}</p>
                          </div>
                        )}
                        {bug.fixSuggestion && (
                          <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-blue-800"><span className="font-medium">Fix suggestion:</span> {bug.fixSuggestion}</p>
                          </div>
                        )}
                        {/* Reproduce: load sample data and jump to the screen the bug is on */}
                        <button type="button" onClick={() => reproduce(bug.screen)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg px-2.5 py-1.5">
                          <FlaskConical className="w-3.5 h-3.5" />
                          Reproduce with sample data{bug.screen ? ` → ${bug.screen}` : ''}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Improvements tab */}
          {activeTab === 'improvements' && (
            <div className="space-y-3">
              {analysis.improvements.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center text-sm text-gray-500">
                  No improvement suggestions found
                </div>
              ) : analysis.improvements.map((imp, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{imp.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(imp.priority)}`}>
                        {imp.priority} priority
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{imp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Can't Fix tab */}
          {activeTab === 'cantfix' && (
            <div className="space-y-3">
              {analysis.cantFix.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center text-sm text-gray-500">
                  Nothing out of scope in these reviews
                </div>
              ) : analysis.cantFix.map((item, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    <p className="text-sm text-gray-500 mt-1">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Replies tab */}
          {activeTab === 'replies' && (
            <div className="space-y-3">
              {analysis.replies.map((reply, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedReply(expandedReply === reply.reviewId ? null : reply.reviewId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-800">Reply to {reply.author}</span>
                    </div>
                    {expandedReply === reply.reviewId
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {(expandedReply === reply.reviewId || true) && (
                    <div className="px-4 pb-4">
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {reply.reply}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <CopyButton text={reply.reply} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Report tab */}
          {activeTab === 'report' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">📊 Executive Summary</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Bugs Found', value: analysis.bugs.length, color: 'red', icon: '🐛' },
                  { label: 'Improvements', value: analysis.improvements.length, color: 'blue', icon: '💡' },
                  { label: "Can't Fix", value: analysis.cantFix.length, color: 'gray', icon: '❌' },
                  { label: 'Replies Ready', value: analysis.replies.length, color: 'green', icon: '💬' },
                ].map(card => (
                  <div key={card.label} className={`bg-white rounded-xl border border-${card.color}-200 p-3 text-center`}>
                    <div className="text-2xl mb-1">{card.icon}</div>
                    <div className={`text-2xl font-bold text-${card.color}-600`}>{card.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800">Critical & High Bugs</h3>
                </div>
                {analysis.bugs.filter(b => b.severity === 'critical' || b.severity === 'high').length === 0 ? (
                  <p className="text-sm text-gray-400">No critical or high severity bugs</p>
                ) : analysis.bugs
                  .filter(b => b.severity === 'critical' || b.severity === 'high')
                  .map((bug, i) => (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium mt-0.5 ${severityColor(bug.severity)}`}>
                        {bug.severity}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{bug.title}</p>
                        <p className="text-xs text-gray-500">{bug.description}</p>
                      </div>
                    </div>
                  ))}
              </div>

              <button onClick={downloadReport}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-blue-700">
                <Download className="w-4 h-4" />
                Download Full Report (.txt)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
