import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Printer, ScrollText, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { ContractAcceptance, ContractPreview, ContractView } from "../types";
import { full } from "../format";
import { Markdown } from "../Markdown";
import { ErrorBox, Skeleton, useFetch } from "../ui";

export const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

/** Premium belge görünümü: TASLAK şeridi + kaydırılabilir metin. */
export function ContractDoc({ markdown, draft = true, onBottom, maxHeight }: { markdown: string; draft?: boolean; onBottom?: (b: boolean) => void; maxHeight?: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  const check = () => {
    const el = ref.current;
    if (el && onBottom) onBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
  };
  useEffect(() => { check(); }, [markdown]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="contract-sheet">
      {draft && <div className="contract-ribbon" role="note">TASLAK – hukuki inceleme yapılmamıştır</div>}
      <div className="contract-doc" ref={ref} onScroll={check} tabIndex={0} aria-label="Taşıma sözleşmesi metni" data-testid="contract-doc" style={maxHeight ? { maxHeight } : undefined}>
        <Markdown text={markdown} />
      </div>
    </div>
  );
}

/** Rezervasyon öncesi imza adımı. */
export function ContractSignModal({ preview, busy, error, notice, defaultName, ctaLabel, onClose, onSign }: {
  preview: ContractPreview | null; busy: boolean; error: ApiError | Error | null; notice: string | null; defaultName: string; ctaLabel: ReactNode;
  onClose: () => void; onSign: (signerName: string) => void;
}) {
  const [bottom, setBottom] = useState(false);
  const [readBox, setReadBox] = useState(false);
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  // metin değişince (yeniden önizleme) onayları sıfırla
  useEffect(() => { setBottom(false); setReadBox(false); setAgree(false); }, [preview?.renderedHash]);
  const read = bottom || readBox;
  const ok = !!preview && read && agree && name.trim().length >= 3 && !busy;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal contract-modal" role="dialog" aria-label="Taşıma sözleşmesi">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 className="serif" style={{ fontSize: 24 }}><ScrollText size={20} style={{ verticalAlign: -3, marginRight: 8 }} />Taşıma sözleşmesi</h3>
          <button className="link" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
        </div>
        {notice && <div className="alert warn" role="status" style={{ marginBottom: 10 }}><div>{notice}</div></div>}
        {!preview && !error && <Skeleton h={320} />}
        {error && !preview && <ErrorBox error={error} />}
        {preview && (
          <>
            <ContractDoc markdown={preview.renderedMarkdown} draft={preview.isDraft} onBottom={setBottom} />
            <div className="tiny muted" style={{ marginTop: 6 }}>Sürüm {preview.version} · parmak izi <span className="mono">{shortHash(preview.renderedHash)}</span></div>
            <div className="contract-sign">
              <label className="chk"><input type="checkbox" checked={read} disabled={bottom} onChange={(e) => setReadBox(e.target.checked)} />
                <span>{bottom ? "Metnin sonuna ulaştınız." : "Metnin tamamını okudum (veya metni sonuna kadar kaydırın)."}</span></label>
              <label className="field-inline"><span className="lbl">E-imza: ad soyad</span>
                <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Ad soyad (e-imza)" autoComplete="name" /></label>
              <label className="chk"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-label="Okudum, onaylıyorum" />
                <span><b>Okudum, onaylıyorum.</b> Bu sözleşmeyi elektronik olarak kabul ediyorum.</span></label>
            </div>
          </>
        )}
        {error && preview && <div style={{ marginTop: 10 }}><ErrorBox error={error} /></div>}
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn cta" disabled={!ok} onClick={() => onSign(name.trim())} data-testid="contract-sign">{busy ? "Gönderiliyor…" : ctaLabel}<Check size={17} /></button>
        </div>
      </div>
    </div>
  );
}

/** Kabul edilmiş sözleşmeyi görüntüleme + yazdır / PDF. */
export function ContractViewerModal({ path, onClose }: { path: string; onClose: () => void }) {
  const { data, error, loading, reload } = useFetch((s) => api<ContractView>("GET", path, undefined, { signal: s }), [path]);
  useEffect(() => {
    document.body.classList.add("print-contract");
    return () => document.body.classList.remove("print-contract");
  }, []);
  return createPortal(
    <div className="overlay contract-portal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal contract-modal" role="dialog" aria-label="Taşıma sözleşmesi">
        <div className="row between no-print" style={{ marginBottom: 10 }}>
          <h3 className="serif" style={{ fontSize: 24 }}>Taşıma sözleşmesi</h3>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => window.print()} disabled={!data}><Printer size={14} />Yazdır / PDF olarak kaydet</button>
            <button className="link" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
          </div>
        </div>
        {loading && <Skeleton h={320} />}
        {error && <ErrorBox error={error} onRetry={reload} />}
        {data && (
          <>
            <div className="contract-print-meta tiny muted" style={{ marginBottom: 8 }}>İmzalayan {data.acceptance.signerName} · {full(data.acceptance.acceptedAt)} · sürüm {data.acceptance.version} · <span className="mono">{data.acceptance.renderedHash}</span></div>
            <ContractDoc markdown={data.renderedMarkdown} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Rezervasyon detayında "Sözleşme" bölümü (müşteri ve taşıyıcı). */
export function ContractSection({ contract, path }: { contract?: ContractAcceptance | null; path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sub-panel" data-testid="contract-section">
      <div className="row between"><span className="eyebrow"><FileText size={11} /> Sözleşme</span><span className="badge warn">Taslak</span></div>
      {contract ? (
        <>
          <div className="kv"><span>Sürüm</span><b>{contract.version}</b></div>
          <div className="kv"><span>İmzalayan</span><b>{contract.signerName}</b></div>
          <div className="kv"><span>Onay zamanı</span><b>{full(contract.acceptedAt)}</b></div>
          <div className="kv"><span>Parmak izi</span><b className="mono" title={contract.renderedHash}>{shortHash(contract.renderedHash)}</b></div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><ScrollText size={14} />Sözleşmeyi görüntüle</button>
        </>
      ) : <div className="small muted" style={{ marginTop: 6 }}>Bu rezervasyon için kayıtlı sözleşme yok.</div>}
      {open && <ContractViewerModal path={path} onClose={() => setOpen(false)} />}
    </div>
  );
}
