import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CLAUDE_MODELS,
  loadAssistantSettings,
  persistAssistantSettings,
  type AssistantSettings,
  type ClaudeConfig,
} from './assistantConfig'
import { AssistantMarkdown } from './AssistantMarkdown'
import { checkClaudeConnection, claudeErrorMessage, streamClaudeChat } from './claude'
import { ContextMeter } from './ContextMeter'
import {
  CLAUDE_MAX_CONTEXT_CHARS,
  computeContextUsage,
  fitChatHistoryToBudget,
  messageChars,
} from './contextBudget'
import {
  buildFullDocumentSystemPrompt,
  getDocumentContextInfo,
} from './documentChunks'
import { type SectionRef } from './headings'
import {
  extractReferencedSections,
  formatSectionLinkGuide,
  MAX_ASSISTANT_FOOTER_SECTIONS,
} from './sectionLinks'

type DocAssistantProps = {
  open: boolean
  onClose: () => void
  markdown: string
  fileName: string
  sections: SectionRef[]
  onNavigateToSection: (id: string) => void
  /**
   * Text to place in the input (e.g. a quoted selection), once per tick.
   * `autoSend` submits it immediately (used for a fully-formed query, e.g.
   * from the command palette) instead of leaving it for the user to finish
   * and send themselves (e.g. a quoted passage awaiting a question).
   */
  prefill?: { text: string; tick: number; autoSend?: boolean } | null
}

type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  relatedSections?: SectionRef[]
}

type SessionContext = {
  docKey: string
  mode: 'full'
  systemPrompt: string
}

function mergeSectionRefs(...lists: SectionRef[][]) {
  const seen = new Set<string>()
  const merged: SectionRef[] = []

  for (const list of lists) {
    for (const section of list) {
      if (seen.has(section.id)) {
        continue
      }
      seen.add(section.id)
      merged.push(section)
    }
  }

  return merged
}

function isHaikuModelId(modelId: string) {
  return /haiku/i.test(modelId)
}

function resolveClaudeModel(current: string, available: string[]) {
  const haikuDefault = CLAUDE_MODELS[0].id
  if (available.length === 0) {
    return haikuDefault
  }
  if (available.includes(current)) {
    return current
  }
  for (const known of CLAUDE_MODELS) {
    if (available.includes(known.id)) {
      return known.id
    }
  }
  const haikuFromAccount = available.find((modelId) => isHaikuModelId(modelId))
  if (haikuFromAccount) {
    return haikuFromAccount
  }

  return available.includes(haikuDefault) ? haikuDefault : available[0]
}

function DocAssistant({
  open,
  onClose,
  markdown,
  fileName,
  sections,
  onNavigateToSection,
  prefill,
}: DocAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const lastPrefillTickRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<AssistantSettings>(() => loadAssistantSettings())
  const [claudeModels, setClaudeModels] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<
    'idle' | 'checking' | 'ok' | 'error'
  >('idle')
  const [showSetup, setShowSetup] = useState(false)

  const contextMaxChars = CLAUDE_MAX_CONTEXT_CHARS

  const docKey = `${fileName}:${markdown.length}`
  const contextInfo = useMemo(() => getDocumentContextInfo(markdown), [markdown])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Drop prefilled text into the input — a quoted passage from the
  // selection menu waits for the user to finish and send it; a fully-formed
  // query from the command palette sends immediately (autoSend), so asking
  // there is one click instead of two.
  useEffect(() => {
    if (!open || !prefill || prefill.tick === lastPrefillTickRef.current) {
      return
    }
    lastPrefillTickRef.current = prefill.tick
    setInput(prefill.text)
    if (prefill.autoSend) {
      void runQuery(prefill.text)
    }
  }, [open, prefill])
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<SessionContext | null>(null)

  const activeClaudeModel = resolveClaudeModel(settings.claude.model, claudeModels)
  const assistantReady = connectionState === 'ok' && Boolean(settings.claude.apiKey.trim())

  useEffect(() => {
    setMessages([])
    setError('')
    setInput('')
    sessionRef.current = null
  }, [markdown, fileName])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      setLoading(false)
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, messages, loading])

  useEffect(() => {
    if (!open) {
      return
    }

    const panel = panelRef.current
    const messagesEl = messagesRef.current
    if (!panel || !messagesEl) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      const field = target?.closest('textarea, input, select') as HTMLElement | null

      if (field && field.scrollHeight > field.clientHeight) {
        const atTop = field.scrollTop <= 0
        const atBottom = field.scrollTop + field.clientHeight >= field.scrollHeight - 1
        const scrollingUp = event.deltaY < 0
        const scrollingDown = event.deltaY > 0

        if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
          return
        }
      }

      event.preventDefault()
      event.stopPropagation()
      messagesEl.scrollTop += event.deltaY
    }

    panel.addEventListener('wheel', onWheel, { passive: false })
    return () => panel.removeEventListener('wheel', onWheel)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const needsSetup = connectionState === 'error' || !settings.claude.apiKey.trim()

    if (needsSetup) {
      setShowSetup(true)
    }
  }, [open, connectionState, settings.claude.apiKey])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const persistSettings = (next: AssistantSettings) => {
    setSettings(next)
    persistAssistantSettings(next)
  }

  const updateClaude = (claude: ClaudeConfig) => {
    persistSettings({ ...settings, claude })
  }

  const testConnection = useCallback(async () => {
    setConnectionState('checking')
    setError('')

    try {
      const result = await checkClaudeConnection(settings.claude)
      const supportedModels = result.models.filter((id) => isHaikuModelId(id))
      if (supportedModels.length === 0) {
        setConnectionState('error')
        setClaudeModels([])
        setError(
          'No Haiku model is exposed for this API key/account. Check Anthropic Console model access for Haiku.',
        )
        return
      }
      setClaudeModels(supportedModels)
      const resolved = resolveClaudeModel(settings.claude.model, supportedModels)
      if (resolved !== settings.claude.model) {
        const next = { ...settings, claude: { ...settings.claude, model: resolved } }
        persistSettings(next)
      }
      setConnectionState('ok')
    } catch (connectionError) {
      setConnectionState('error')
      setError(claudeErrorMessage(connectionError))
    }
  }, [settings])

  useEffect(() => {
    if (!open) {
      return
    }
    void testConnection()
  }, [open, testConnection])

  // Claude's context window is large enough to always send the whole
  // document, cached for the session once built.
  const resolveSystemPrompt = () => {
    const existing = sessionRef.current
    if (existing && existing.docKey === docKey) {
      return {
        systemPrompt: existing.systemPrompt,
        relatedSections: [] as SectionRef[],
      }
    }

    const linkGuide = formatSectionLinkGuide(sections)
    const systemPrompt = buildFullDocumentSystemPrompt(fileName, markdown, linkGuide)
    sessionRef.current = { docKey, mode: 'full', systemPrompt }
    return { systemPrompt, relatedSections: [] as SectionRef[] }
  }

  const estimateSystemPromptChars = useCallback(() => {
    const session = sessionRef.current
    if (session && session.docKey === docKey) {
      return session.systemPrompt.length
    }

    return buildFullDocumentSystemPrompt(
      fileName,
      markdown,
      formatSectionLinkGuide(sections),
    ).length
  }, [docKey, fileName, markdown, sections])

  const contextUsage = useMemo(() => {
    const history = messages.filter((message) => message.content.trim())
    return computeContextUsage(
      {
        systemChars: estimateSystemPromptChars(),
        history,
        draftQuestion: input,
      },
      contextMaxChars,
    )
  }, [contextMaxChars, estimateSystemPromptChars, input, messages])

  const appendAssistantToken = (assistantText: string) => {
    setMessages((current) => {
      const next = [...current]
      const last = next[next.length - 1]
      next[next.length - 1] = {
        ...last,
        role: 'assistant',
        content: assistantText,
      }
      return next
    })
  }

  const runQuery = async (rawQuestion: string) => {
    const question = rawQuestion.trim()
    if (!question || loading) {
      return
    }

    if (!settings.claude.apiKey.trim()) {
      setError('Enter your Anthropic API key in connection settings.')
      setShowSetup(true)
      return
    }

    const resolved = resolveClaudeModel(settings.claude.model, claudeModels)
    const activeClaude = { ...settings.claude, model: resolved }
    if (resolved !== settings.claude.model) {
      persistSettings({ ...settings, claude: activeClaude })
    }

    const { systemPrompt, relatedSections: contextSections } = resolveSystemPrompt()

    const requestUsage = computeContextUsage(
      {
        systemChars: systemPrompt.length,
        history: messages.filter((message) => message.content.trim()),
        draftQuestion: question,
      },
      contextMaxChars,
    )
    if (requestUsage.isOverBudget) {
      setError(
        'This question would exceed the context window. Shorten your message or start fresh on a smaller topic.',
      )
      return
    }

    setInput('')
    setError('')
    setLoading(true)

    const userMessage: AssistantMessage = { role: 'user', content: question }
    setMessages((current) => [...current, userMessage])

    const controller = new AbortController()
    abortRef.current = controller

    let assistantText = ''
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: '', relatedSections: contextSections },
    ])

    const reservedChars = messageChars(systemPrompt) + messageChars(question)
    const { messages: priorMessages } = fitChatHistoryToBudget(
      messages.filter((message) => message.content.trim()),
      reservedChars,
      contextMaxChars,
    )

    const chatHistory = priorMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    try {
      await streamClaudeChat(
        activeClaude,
        systemPrompt,
        [...chatHistory, { role: 'user', content: question }],
        {
          signal: controller.signal,
          onToken: (token) => {
            assistantText += token
            appendAssistantToken(assistantText)
          },
        },
      )

      const relatedSections = mergeSectionRefs(
        extractReferencedSections(assistantText, sections),
        contextSections,
      ).slice(0, MAX_ASSISTANT_FOOTER_SECTIONS)

      setMessages((current) => {
        const next = [...current]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            relatedSections,
          }
        }
        return next
      })
    } catch (sendError) {
      setMessages((current) => {
        if (
          current.length > 0 &&
          current[current.length - 1].role === 'assistant' &&
          !current[current.length - 1].content
        ) {
          return current.slice(0, -1)
        }
        return current
      })
      setError(claudeErrorMessage(sendError))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    void runQuery(input)
  }

  if (!open) {
    return null
  }

  const connectionLabel =
    connectionState === 'checking'
      ? 'Checking connection…'
      : connectionState === 'ok'
        ? `Connected · ${activeClaudeModel}`
        : connectionState === 'error'
          ? 'Not connected'
          : 'Connection not checked'

  const checkingLabel = 'Checking Claude connection…'

  const setupPlaceholder = 'Add your API key above to start asking questions…'

  return (
    <aside
      ref={panelRef}
      className="assistant-panel"
      role="dialog"
      aria-label="Document assistant"
    >
      <header className="assistant-header">
        <h2 className="assistant-title">Document assistant</h2>
        <div className="assistant-header-actions">
          <button
            type="button"
            className={
              showSetup
                ? 'icon-button assistant-conn-button active'
                : 'icon-button assistant-conn-button'
            }
            aria-label="Connection settings"
            aria-expanded={showSetup}
            onClick={() => setShowSetup((value) => !value)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M6 12H2" />
              <path d="M22 12h-4" />
              <path d="M12 6a2 2 0 0 0-2 2v2a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-2a2 2 0 0 0-2-2z" />
            </svg>
            <span
              className={
                assistantReady
                  ? 'assistant-conn-dot assistant-conn-dot-ok'
                  : connectionState === 'error'
                    ? 'assistant-conn-dot assistant-conn-dot-error'
                    : 'assistant-conn-dot'
              }
            />
          </button>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {showSetup ? (
        <div className="assistant-setup-popover">
          <p className="assistant-setup-status">{connectionLabel}</p>

          <label className="assistant-field">
            <span>API key</span>
            <input
              type="password"
              value={settings.claude.apiKey}
              onChange={(event) =>
                updateClaude({ ...settings.claude, apiKey: event.target.value })
              }
              placeholder="sk-ant-…"
              autoComplete="off"
            />
          </label>
          <label className="assistant-field">
            <span>Model</span>
            <select
              value={activeClaudeModel}
              onChange={(event) =>
                updateClaude({ ...settings.claude, model: event.target.value })
              }
            >
              {(claudeModels.length > 0
                ? claudeModels
                : CLAUDE_MODELS.map((model) => model.id)
              ).map((modelId) => (
                <option key={modelId} value={modelId}>
                  {CLAUDE_MODELS.find((entry) => entry.id === modelId)?.label ??
                    (isHaikuModelId(modelId) ? `Claude Haiku (${modelId})` : modelId)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="assistant-test" onClick={testConnection}>
            Test connection
          </button>
          <p className="assistant-hint">
            Get an API key from{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
            . Stored locally in your browser. Use <code>npm run dev</code> or{' '}
            <code>npm run preview</code> so requests go through the built-in proxy.
          </p>

          <div className="assistant-context-info">
            <span className="assistant-context-label">Document context</span>
            <p className="assistant-context-summary">{contextInfo.summary}</p>
            <p className="assistant-context-detail">{contextInfo.detail}</p>
          </div>
        </div>
      ) : null}

      <div className="assistant-messages" ref={messagesRef}>
        {!assistantReady && connectionState !== 'checking' ? (
          <div className="assistant-setup-guide">
            <h3>Connect Claude to get started</h3>
            <p>
              Use Anthropic&apos;s Claude API for cloud-powered answers about this document.
              Your API key stays in the browser on this machine.
            </p>
            <ol className="assistant-setup-steps">
              <li>
                <strong>Get an API key</strong>
                <span>
                  Sign in at{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    console.anthropic.com
                  </a>{' '}
                  and create an API key.
                </span>
              </li>
              <li>
                <strong>Run the app locally</strong>
                <span>
                  Claude requests use a dev proxy to avoid browser CORS blocks. Start with:
                </span>
                <code>npm run dev</code>
              </li>
              <li>
                <strong>Add your key</strong>
                <span>
                  Click the connection icon, paste your API key, pick a model, then click Test
                  connection.
                </span>
              </li>
            </ol>
            {connectionState === 'error' && error ? (
              <p className="assistant-error">{error}</p>
            ) : null}
            <button type="button" className="assistant-test" onClick={testConnection}>
              Test connection
            </button>
          </div>
        ) : connectionState === 'checking' && messages.length === 0 ? (
          <p className="assistant-empty">{checkingLabel}</p>
        ) : messages.length === 0 ? (
          <div className="assistant-empty">
            <p>Ask anything about this document.</p>
            <div className="assistant-suggestions">
              {[
                'What is this document about?',
                'Summarize the key points',
                'What are the main topics?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="assistant-suggestion"
                  disabled={loading}
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'assistant-message assistant-message-user'
                  : 'assistant-message assistant-message-assistant'
              }
            >
              {message.role === 'assistant' ? (
                <div className="assistant-message-body">
                  {message.content ? (
                    <AssistantMarkdown
                      content={message.content}
                      sections={sections}
                      onNavigateToSection={onNavigateToSection}
                    />
                  ) : loading && index === messages.length - 1 ? (
                    <span className="assistant-typing">Thinking…</span>
                  ) : null}
                </div>
              ) : (
                message.content
              )}

              {message.role === 'assistant' &&
              message.relatedSections &&
              message.relatedSections.length > 0 &&
              message.content ? (
                <div className="assistant-section-links">
                  <span className="assistant-section-links-label">
                    {message.relatedSections.length === 1 ? 'Go to section' : 'Go to sections'}
                  </span>
                  {message.relatedSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className="assistant-section-link"
                      onClick={() => onNavigateToSection(section.id)}
                    >
                      {section.text}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && assistantReady ? <p className="assistant-error">{error}</p> : null}

      <form className="assistant-form" onSubmit={sendMessage}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            assistantReady ? 'Ask about this document…' : setupPlaceholder
          }
          rows={3}
          disabled={loading || !assistantReady}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void sendMessage(event)
            }
          }}
        />
        <div className="assistant-form-actions">
          {assistantReady ? <ContextMeter percent={contextUsage.percent} /> : null}
          <button
            type="submit"
            className="assistant-send"
            disabled={
              loading ||
              !input.trim() ||
              !assistantReady ||
              contextUsage.isOverBudget
            }
          >
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  )
}

export default DocAssistant
