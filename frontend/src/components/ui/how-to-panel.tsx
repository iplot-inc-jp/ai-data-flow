'use client'

import * as React from 'react'
import { HelpCircle, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function HowToPanel({
  title = '操作方法',
  steps,
  shortcuts,
  open,
  onOpenChange,
}: {
  title?: string
  steps: string[]
  shortcuts?: { keys: string; desc: string }[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
          操作方法
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white text-gray-900 max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">操作方法</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>

          {shortcuts && shortcuts.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-2">
                <Keyboard className="w-4 h-4" aria-hidden="true" />
                キーボードショートカット
              </h3>
              <ul className="space-y-1.5">
                {shortcuts.map((sc, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 text-sm text-gray-700"
                  >
                    <span>{sc.desc}</span>
                    <kbd className="inline-flex items-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-600 shadow-sm">
                      {sc.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
