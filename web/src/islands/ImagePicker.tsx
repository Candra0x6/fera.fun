import { useId, useRef, useState } from 'react'
import { IMAGE_ACCEPTED_TYPES } from '../chain/coinImage'
import { prepareImageFile } from '../chain/imageEncode'
import { LABEL } from './shared'

interface Props {
  value: string | null
  disabled: boolean
  onChange: (dataUri: string | null) => void
}

export function ImagePicker({ value, disabled, onChange }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept(file: File | undefined): Promise<void> {
    if (file === undefined || disabled) return
    setWorking(true)
    setError(null)
    const result = await prepareImageFile(file)
    setWorking(false)
    if (result.ok) onChange(result.dataUri)
    else setError(result.message)
  }

  function clear(): void {
    setError(null)
    onChange(null)
    if (inputRef.current !== null) inputRef.current.value = ''
  }

  const locked = disabled || working
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={LABEL} htmlFor={inputId}>Token image</label>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#4d6670]">Optional</span>
      </div>
      <div
        data-testid="launch-image-drop"
        className={`flex items-center gap-3 rounded-xl border-[3px] border-dashed px-3 py-2 transition ${dragging ? 'border-[#2b7a8e] bg-[#BFE8F7]' : 'border-[#d9c593] bg-[#fbf3de]'}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (!locked) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void accept(event.dataTransfer.files[0])
        }}
      >
        <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden border-[3px] border-[#d9c593] bg-[#f7edd6] flex items-center justify-center text-[#4d6670]">
          {value !== null ? (
            <img src={value} alt="Selected token image preview" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 4 4 3-3 5 5M4 5h16v14H4z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0 text-[11px] font-semibold text-[#4d6670]">
          <input
            ref={inputRef}
            id={inputId}
            data-testid="launch-image-input"
            type="file"
            accept={IMAGE_ACCEPTED_TYPES.join(',')}
            disabled={locked}
            className="sr-only"
            onChange={(event) => void accept(event.target.files?.[0])}
          />
          <button type="button" data-testid="launch-image-pick" className="font-extrabold text-[#0369a1] underline disabled:opacity-50" disabled={locked} onClick={() => inputRef.current?.click()}>
            {working ? 'Processing...' : value === null ? 'Choose image' : 'Change image'}
          </button>
          <span> or drop one here</span>
          <div className="text-[10px]">PNG, JPEG, WebP or GIF, up to 5 MB. Shrunk to 128 px and stored on-chain.</div>
        </div>
        {value !== null ? (
          <button type="button" data-testid="launch-image-remove" aria-label="Remove token image" className="p-1 text-[#be123c] font-extrabold disabled:opacity-50" disabled={locked} onClick={clear}>✕</button>
        ) : null}
      </div>
      {error !== null ? <p className="mt-1 text-[11px] text-[#be123c]" role="alert">{error}</p> : null}
    </div>
  )
}
