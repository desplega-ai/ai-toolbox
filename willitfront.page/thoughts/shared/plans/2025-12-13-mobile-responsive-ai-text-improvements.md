# Mobile Responsive + AI Text Improvements Implementation Plan

## Overview

Implement mobile responsiveness across the app and improve AI text block rendering with:
1. Proper spacing between paragraphs
2. Markdown formatting guidance in system prompt
3. Collapsible AI messages (max 3 lines initially with "Show more" button)

## Current State Analysis

### Mobile/Responsive Issues:
- **App.tsx:39** - Landing page uses `md:grid-cols-3` but no mobile padding adjustments
- **TabBar.tsx** - Tab bar has some `sm:` breakpoints but tabs can overflow on mobile
- **ChatNotebookTab.tsx:791** - Messages use fixed `w-[80%]` width regardless of screen size
- **ChatNotebookTab.tsx:1095** - Toolbar has no responsive handling for buttons
- **ChatNotebookTab.tsx:1256-1305** - Input area has no mobile optimization
- **ModelSelector.tsx:98** - Fixed `w-[280px]` width doesn't adapt to mobile

### AI Text Rendering:
- **ChatNotebookTab.tsx:815** - Uses `prose prose-sm` with no paragraph spacing customization
- **lib/systemPrompt.ts** - No guidance on Markdown formatting in system prompt
- **No collapsible behavior** for long AI responses currently exists

## Desired End State

1. **Mobile Responsiveness:**
   - Tab bar adapts to mobile (scrollable tabs, icon-only on small screens)
   - Toolbar buttons collapse into icons on mobile
   - Messages use full width on mobile, 80% on larger screens
   - Model selector adapts to available space
   - Input area optimized for mobile keyboards
   - Landing page cards stack vertically on mobile

2. **AI Text Improvements:**
   - Paragraphs have clear visual separation (spacing)
   - AI messages collapse to ~3 lines with "Show more" button
   - System prompt instructs AI to use Markdown (paragraphs, lists, bold) without excessive headings

## What We're NOT Doing

- Complete redesign of the UI
- Mobile-specific navigation (hamburger menus, etc.)
- Touch gestures or swipe interactions
- Separate mobile views/layouts

## Implementation Approach

Use Tailwind responsive utilities (`sm:`, `md:`, `lg:`) to progressively enhance the layout. Add a collapsible wrapper component for AI messages. Update system prompt with formatting guidelines.

---

## Phase 1: System Prompt Markdown Formatting

### Overview
Update the system prompt to instruct the AI to format responses using Markdown with proper paragraph spacing, avoiding excessive headings.

### Changes Required:

#### 1. Update System Prompt
**File**: `lib/systemPrompt.ts`
**Changes**: Add formatting instructions after the current prompt

```typescript
// Add after line 86 (after DUCKDB_SYNTAX_TIPS block), before sqlBlocks section:

## Response Formatting Guidelines
Format your responses using Markdown for readability:
- Use **bold** for emphasis on key terms or values
- Use bullet points or numbered lists for multiple items
- Separate paragraphs with blank lines for clear visual breaks
- Use \`inline code\` for column names, table names, or SQL snippets
- Use code blocks with \`\`\`sql for multi-line SQL examples
- Avoid using headings (##, ###) unless the response covers multiple distinct topics
- Keep responses concise and well-structured
`;
```

**Also update**: `src/server/buildSystemPrompt.ts` with the same changes (local dev version)

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] New AI responses use proper Markdown formatting
- [ ] Responses have clear paragraph separation
- [ ] No excessive headings in typical responses

---

## Phase 2: AI Message Collapsible Component

### Overview
Create a collapsible wrapper for AI message text that shows max 3 lines initially with a "Show more" button.

### Changes Required:

#### 1. Add CollapsibleText Component
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Add new component and integrate into message rendering

```tsx
// Add after ReasoningBlock component (around line 220):

interface CollapsibleTextProps {
  children: React.ReactNode;
  maxLines?: number;
}

function CollapsibleText({ children, maxLines = 3 }: CollapsibleTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const lineHeight = parseInt(getComputedStyle(contentRef.current).lineHeight) || 24;
      const maxHeight = lineHeight * maxLines;
      setNeedsCollapse(contentRef.current.scrollHeight > maxHeight + 10);
    }
  }, [children, maxLines]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={!isExpanded && needsCollapse ? 'overflow-hidden' : ''}
        style={!isExpanded && needsCollapse ? { maxHeight: `${maxLines * 1.5}rem` } : undefined}
      >
        {children}
      </div>
      {needsCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-sm text-[var(--hn-orange)] hover:underline flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={14} />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}
```

#### 2. Add ChevronUp to imports
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Add `ChevronUp` to lucide-react imports (line 31)

#### 3. Wrap AI message content
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Update the message rendering (around line 811-889)

```tsx
{/* Text content with markdown for assistant */}
{textContent && (
  isUser ? (
    <div className="whitespace-pre-wrap">{textContent}</div>
  ) : (
    <CollapsibleText maxLines={3}>
      <div className="prose prose-sm max-w-none [&>p]:mb-4 [&>ul]:mb-4 [&>ol]:mb-4 prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2 prose-code:text-orange-600 prose-code:before:content-none prose-code:after:content-none prose-table:my-0">
        <Markdown
          // ... rest of Markdown component stays the same
        >
          {textContent}
        </Markdown>
      </div>
    </CollapsibleText>
  )
)}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Short AI responses show fully without "Show more" button
- [ ] Long AI responses collapse to ~3 lines
- [ ] "Show more" button reveals full content
- [ ] "Show less" button collapses back
- [ ] Paragraphs have visible spacing in AI responses

---

## Phase 3: Mobile Responsive - Toolbar & Messages

### Overview
Make the chat toolbar and message bubbles responsive on mobile devices.

### Changes Required:

#### 1. Responsive Toolbar
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Update toolbar section (lines 1094-1187)

```tsx
{/* Toolbar */}
<div className="flex items-center gap-1 sm:gap-2 p-2 sm:p-3 border-b bg-gray-50 overflow-x-auto">
  <ModelSelector
    value={defaultModel}
    onChange={handleModelChange}
    disabled={status === 'streaming'}
  />

  <Button variant="outline" size="sm" onClick={addSqlBlock} className="shrink-0">
    <Plus size={16} className="sm:mr-1" />
    <span className="hidden sm:inline">Add SQL</span>
  </Button>

  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="shrink-0">
        <Database size={16} className="sm:mr-1" />
        <span className="hidden sm:inline">Schema</span>
      </Button>
    </DialogTrigger>
    {/* ... dialog content ... */}
  </Dialog>

  {/* SQL block actions */}
  {sqlBlocks.length > 0 && (
    <>
      <div className="hidden sm:block w-px h-6 bg-gray-300 mx-1" />
      <Button variant="ghost" size="sm" onClick={runAllBlocks} disabled={status === 'streaming'} title="Run all SQL blocks" className="shrink-0">
        <PlayCircle size={16} className="sm:mr-1" />
        <span className="hidden sm:inline">Run All</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={expandAll} title="Expand all results" className="shrink-0">
        <ChevronsUpDown size={16} className="sm:mr-1" />
        <span className="hidden sm:inline">Expand</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={collapseAll} title="Collapse all results" className="shrink-0">
        <ChevronsDownUp size={16} className="sm:mr-1" />
        <span className="hidden sm:inline">Collapse</span>
      </Button>
    </>
  )}

  <span className="text-xs sm:text-sm text-gray-500 ml-auto whitespace-nowrap">
    {messages.length} msg{messages.length !== 1 ? 's' : ''}
    {sqlBlocks.length > 0 && ` · ${sqlBlocks.length} SQL`}
  </span>
</div>
```

#### 2. Responsive Message Bubbles
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Update message width (line 791)

```tsx
<div
  className={`w-full sm:w-[85%] md:w-[80%] rounded-lg ${
    isUser
      ? 'bg-[var(--hn-orange)] text-white p-3 sm:p-4'
      : 'bg-white border shadow-sm p-3 sm:p-4'
  }`}
>
```

#### 3. Responsive Content Container
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Update content padding (line 1191)

```tsx
<div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-3 sm:space-y-4">
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Toolbar buttons show icons only on mobile, icons+text on desktop
- [ ] Message bubbles use full width on mobile
- [ ] Content area has appropriate padding on mobile
- [ ] Toolbar is scrollable horizontally if needed

---

## Phase 4: Mobile Responsive - Model Selector

### Overview
Make the model selector adapt to mobile screen sizes.

### Changes Required:

#### 1. Responsive Model Selector Width
**File**: `src/components/ModelSelector.tsx`
**Changes**: Update button and popover widths

```tsx
// Line 76 (loading state):
<Button variant="outline" className="w-full sm:w-[280px] justify-between bg-white" disabled>

// Line 85 (error state):
<Button variant="outline" className="w-full sm:w-[280px] justify-between bg-white" disabled>

// Line 94-103 (main button):
<Button
  variant="outline"
  role="combobox"
  aria-expanded={open}
  className="w-full sm:w-[280px] justify-between bg-white"
  disabled={disabled}
>

// Line 105 (popover content):
<PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0 bg-white" align="start">
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Model selector uses full toolbar width on mobile
- [ ] Popover is properly sized on mobile screens
- [ ] Search and selection work correctly on touch devices

---

## Phase 5: Mobile Responsive - Input Area

### Overview
Optimize the chat input area for mobile devices.

### Changes Required:

#### 1. Responsive Input Area
**File**: `src/components/notebook/ChatNotebookTab.tsx`
**Changes**: Update input section (lines 1253-1306)

```tsx
{/* Input area */}
<div className="border-t bg-gray-50">
  <form onSubmit={handleChatSubmit} className="max-w-4xl mx-auto p-2 sm:p-4">
    <div className="flex gap-2 items-end">
      <div className="flex-1 relative">
        <textarea
          value={chatInput}
          onChange={(e) => {
            setChatInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (chatInput.trim() && status !== 'streaming' && !schemaLoading) {
                handleChatSubmit(e);
              }
            }
          }}
          placeholder={schemaLoading ? 'Loading schema...' : 'Ask about HN data...'}
          disabled={status === 'streaming' || schemaLoading}
          rows={1}
          className="w-full px-3 sm:px-4 py-2 pb-6 sm:pb-6 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--hn-orange)] focus:border-transparent resize-none overflow-y-auto placeholder:text-gray-400 text-sm sm:text-base"
          style={{ minHeight: '42px', maxHeight: '120px' }}
        />
        <span className="absolute bottom-1.5 sm:bottom-2 right-2 sm:right-3 text-[9px] sm:text-[10px] text-gray-400 pointer-events-none hidden sm:block">
          Enter to send · Shift+Enter for new line
        </span>
      </div>
      <Button
        type="submit"
        disabled={!chatInput.trim() || status === 'streaming' || schemaLoading}
        className="shrink-0 h-[42px]"
      >
        {status === 'streaming' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Send size={16} />
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={addSqlBlock}
        title="Add SQL block"
        className="shrink-0 h-[42px] hidden sm:flex"
      >
        <Database size={14} className="sm:mr-1" />
        <span className="hidden sm:inline text-xs">+ SQL</span>
      </Button>
    </div>
  </form>
</div>
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Input area is usable on mobile keyboards
- [ ] Send button is always visible and tappable
- [ ] SQL button is hidden on mobile (accessible via toolbar)
- [ ] Keyboard hints hidden on mobile

---

## Phase 6: Mobile Responsive - Tab Bar & Landing Page

### Overview
Make the tab bar and landing page responsive on mobile devices.

### Changes Required:

#### 1. Responsive Tab Bar
**File**: `src/components/tabs/TabBar.tsx`
**Changes**: Make tabs scrollable and handle overflow

```tsx
// Update the main container (line 66):
<div className="flex items-center bg-[var(--hn-orange)] px-2 h-10 overflow-hidden">

// Wrap tabs in scrollable container (around line 79):
<div className="flex-1 flex items-center overflow-x-auto scrollbar-hide min-w-0">
  {tabs.map(tab => (
    <div
      key={tab.id}
      className={`flex items-center px-2 sm:px-3 py-1 mr-1 cursor-pointer rounded-t shrink-0 ${
        tab.id === activeTabId ? 'bg-[var(--hn-bg)]' : 'bg-orange-200 hover:bg-orange-100'
      }`}
      onClick={() => onTabSelect(tab.id)}
      onDoubleClick={() => handleDoubleClick(tab)}
    >
      {editingTabId === tab.id ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="text-sm w-20 sm:w-24 px-1 rounded border border-gray-300 outline-none"
        />
      ) : (
        <span className="text-xs sm:text-sm truncate max-w-20 sm:max-w-32">{tab.title}</span>
      )}
      <button
        className="ml-1 sm:ml-2 hover:bg-gray-200 rounded p-0.5"
        onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
      >
        <X size={12} className="sm:hidden" />
        <X size={14} className="hidden sm:block" />
      </button>
    </div>
  ))}
</div>
```

#### 2. Add scrollbar-hide utility
**File**: `src/index.css`
**Changes**: Add utility class after existing styles

```css
/* Hide scrollbar for tabs */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

#### 3. Responsive Landing Page
**File**: `src/App.tsx`
**Changes**: Improve mobile layout (lines 36-69)

```tsx
<div className="h-full flex flex-col items-center justify-center p-4 sm:p-8">
  <h1 className="text-xl sm:text-2xl font-bold mb-2 text-center">Will it front page?</h1>
  <p className="text-gray-500 mb-6 sm:mb-8 text-center text-sm sm:text-base max-w-lg">
    Analyze what makes content go viral. Currently featuring Hacker News data, with Product Hunt and more coming soon.
  </p>
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl w-full">
    {QUICK_ACTIONS.map((action) => (
      <Card
        key={action.title}
        className={`transition-all ${
          action.disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'cursor-pointer hover:border-[var(--hn-orange)] hover:shadow-md active:scale-[0.98]'
        }`}
        onClick={() => !action.disabled && action.type && createTab(action.type, action.title)}
      >
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className={`p-2 sm:p-3 rounded-lg w-fit ${action.disabled ? 'bg-gray-100' : 'bg-orange-100'}`}>
              <action.icon className={`h-5 w-5 sm:h-7 sm:w-7 ${action.disabled ? 'text-gray-400' : 'text-[var(--hn-orange)]'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-base sm:text-lg">{action.title}</CardTitle>
                {action.disabled && (
                  <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                )}
              </div>
              <CardDescription className="text-sm">{action.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    ))}
  </div>
</div>
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Tab bar scrolls horizontally when many tabs are open
- [ ] Tabs are smaller but still usable on mobile
- [ ] Landing page cards stack on mobile (1 column)
- [ ] Landing page shows 2 columns on tablet, 3 on desktop
- [ ] Touch interactions feel responsive (active:scale effect)

---

## Phase 7: Mobile Responsive - Dashboard Tab

### Overview
Make the dashboard tab responsive with horizontally scrollable sub-tabs.

### Changes Required:

#### 1. Responsive Dashboard Sub-tabs
**File**: `src/components/tabs/DashboardTab.tsx`
**Changes**: Make tabs scrollable and responsive

```tsx
{/* Internal tab bar */}
<div className="flex items-center border-b bg-gray-50 px-2 sm:px-4 overflow-x-auto scrollbar-hide">
  {dashboards.map(d => {
    const Icon = DASHBOARD_ICONS[d.id] || BarChart3;
    return (
      <button
        key={d.id}
        onClick={() => setActiveDashboardId(d.id)}
        className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
          d.id === activeDashboardId
            ? 'border-[var(--hn-orange)] text-[var(--hn-orange)]'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
      >
        <Icon size={14} className="sm:w-4 sm:h-4" />
        <span className="hidden xs:inline sm:inline">{d.name}</span>
      </button>
    );
  })}
</div>
```

#### 2. Responsive Dashboard Content
**File**: `src/components/tabs/DashboardTab.tsx`
**Changes**: Update content area padding

```tsx
{/* Dashboard content */}
<div className="flex-1 overflow-auto p-2 sm:p-4">
  <div className="mb-3 sm:mb-4">
    <h1 className="text-xl sm:text-2xl font-bold">{dashboard.name}</h1>
    <p className="text-gray-500 text-sm sm:text-base">{dashboard.description}</p>
  </div>

  {hasMetrics && (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
      {metrics.map(query => (
        <DashboardPanel key={query.id} query={query} />
      ))}
    </div>
  )}

  <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
    {otherQueries.map(query => (
      <Card key={query.id}>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{query.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <DashboardPanel query={query} />
        </CardContent>
      </Card>
    ))}
  </div>
</div>
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] App builds: `bun run build`

#### Manual Verification:
- [ ] Dashboard sub-tabs scroll horizontally on mobile
- [ ] Metrics show in 2-column grid on mobile
- [ ] Chart cards stack on mobile, 2-column on desktop
- [ ] All content is readable on mobile screens

---

## Testing Strategy

### Unit Tests:
- No specific unit tests needed for responsive CSS changes

### Integration Tests:
- Test collapsible text component expansion/collapse
- Test system prompt includes formatting guidelines

### Manual Testing Steps:
1. Open app in Chrome DevTools mobile view (iPhone, Pixel)
2. Test all toolbar buttons are accessible
3. Test chat input works with mobile keyboard
4. Test model selector dropdown positioning
5. Test tab overflow scrolling with 5+ tabs
6. Test AI response collapse/expand
7. Test landing page card grid responsiveness
8. Test dashboard sub-tabs scrolling

## Performance Considerations

- CollapsibleText uses `useEffect` to measure content height only on mount/content change
- CSS-based collapse is more performant than JS-based height animation
- No impact on existing functionality

## References

- Current responsive breakpoints used: `sm:`, `md:`, `lg:`
- Tailwind v4 theme: `src/index.css`
- Main chat component: `src/components/notebook/ChatNotebookTab.tsx`
- System prompt: `lib/systemPrompt.ts`, `src/server/buildSystemPrompt.ts`
