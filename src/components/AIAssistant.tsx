import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ChatMessage, streamClaude, buildContext, buildChatSystem, generateInsights } from '../utils/ai';

function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-4 mb-1">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}

export default function AIAssistant() {
  const { data, t, lang } = useApp();
  const [tab, setTab] = useState<'chat' | 'insights'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError('');
    setLoading(true);

    const allMessages: ChatMessage[] = [...messages, userMsg];
    let assistantText = '';

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamClaude(
        buildChatSystem(data, lang),
        allMessages,
        chunk => {
          assistantText += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantText };
            return updated;
          });
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiError'));
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  async function doGenerateInsights() {
    if (insightsLoading) return;
    setInsights('');
    setInsightsLoading(true);
    setError('');
    const context = buildContext(data, lang);
    let text = '';
    try {
      await generateInsights(context, lang, chunk => {
        text += chunk;
        setInsights(text);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiError'));
    } finally {
      setInsightsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('ai')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button onClick={() => setTab('chat')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'chat' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t('aiChat')}
            </button>
            <button onClick={() => setTab('insights')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'insights' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{t('aiInsights')}</span>
            </button>
          </div>
          {tab === 'chat' && messages.length > 0 && (
            <button onClick={() => { setMessages([]); setError(''); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg">
              <Trash2 className="w-3.5 h-3.5" /> {t('aiClear')}
            </button>
          )}
        </div>
      </div>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 pb-2">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-blue-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">
                  {lang === 'is' ? 'Hvernig get ég hjálpað þér í dag?' : 'How can I help you today?'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {(lang === 'is' ? [
                    'Hvernig líður rekstrinum?',
                    'Hverjar eru stærstu útgjaldirnar?',
                    'Eru einhverjar ógreiddar reikningar?',
                    'Skrifaðu lýsingu á reikning fyrir vefsíðugerð',
                  ] : [
                    'How is the business doing?',
                    'What are my biggest expenses?',
                    'Any overdue invoices?',
                    'Draft an invoice description for web design',
                  ]).map(suggestion => (
                    <button key={suggestion}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-100">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                    <Bot className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' && msg.content === '' && loading ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">{lang === 'is' ? 'Hugsa...' : 'Thinking...'}</span>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 pt-3 border-t border-gray-100">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('aiPlaceholder')}
                rows={1}
                className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {lang === 'is' ? 'Enter til að senda · Shift+Enter fyrir nýja línu' : 'Enter to send · Shift+Enter for new line'}
            </p>
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {tab === 'insights' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={doGenerateInsights}
              disabled={insightsLoading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {insightsLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'is' ? 'Greinir...' : 'Analyzing...'}</>
                : <><Sparkles className="w-4 h-4" />{t('aiGenerate')}</>
              }
            </button>
            {insights && !insightsLoading && (
              <button onClick={doGenerateInsights}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl">
                <RefreshCw className="w-3.5 h-3.5" /> {lang === 'is' ? 'Endurgera' : 'Regenerate'}
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {!insights && !insightsLoading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Sparkles className="w-10 h-10 text-blue-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {lang === 'is'
                  ? 'Smelltu á "Greina gögn" til að fá ítarlega fjárhagsgreiningu byggða á raunverulegum gögnum þínum.'
                  : 'Click "Generate Analysis" to get a detailed financial analysis based on your actual data.'}
              </p>
            </div>
          )}

          {(insights || insightsLoading) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              {insightsLoading && !insights && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {lang === 'is' ? 'AI er að greina gögn þín...' : 'AI is analyzing your data...'}
                </div>
              )}
              {insights && (
                <div
                  className="prose prose-sm max-w-none text-gray-800 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(insights) }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
