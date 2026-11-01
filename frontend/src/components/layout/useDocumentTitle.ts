import { useEffect } from 'react'

/** Sets the browser tab title ("Jutsu Library · NARUTO"); null/undefined = just "NARUTO". */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · NARUTO` : 'NARUTO'
  }, [title])
}
