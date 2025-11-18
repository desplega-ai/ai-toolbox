'use client'
import { useEditorStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function SettingsDialog() {
  const { apiKey, aiModel, setApiKey, setAIModel } = useEditorStore()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Settings</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="api-key">OpenRouter API Key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a>
            </p>
          </div>
          <div>
            <Label htmlFor="model">AI Model</Label>
            <select
              id="model"
              value={aiModel}
              onChange={(e) => setAIModel(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="openai/gpt-4">GPT-4</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
            </select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
