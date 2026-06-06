'use client'

import * as React from 'react'
import { HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function HelpTooltip({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="button"
            aria-label={text}
            className={cn(
              'inline-flex cursor-help items-center text-gray-400 outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded-full',
              className
            )}
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
