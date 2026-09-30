import { ChangeEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { convertSourceToSystemDraft, SystemDraftPayload, SystemDraftSourceType } from '../../../services/toolsService';

function formatJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sourceLabel(sourceType: SystemDraftSourceType) {
  switch (sourceType) {
    case 'html_enriched':
      return 'HTML enrichi';
    case 'pdf':
      return 'PDF';
    default:
      return 'HTML';
  }
}

async function readFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ToolsPage() {
  const [sourceType, setSourceType] = useState<SystemDraftSourceType>('html');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [draft, setDraft] = useState<SystemDraftPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const jsonPreview = useMemo(() => (draft ? formatJson(draft) : ''), [draft]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleConvert = async () => {
    if (!selectedFile) {
      setErrorMessage('Choisis un fichier HTML ou PDF avant de lancer la conversion.');
      setStatusMessage(null);
      return;
    }
    setIsConverting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      const nextDraft = await convertSourceToSystemDraft({
        sourceType,
        fileName: selectedFile.name,
        contentBase64
      });
      setDraft(nextDraft);
      setStatusMessage(`Conversion ${sourceLabel(sourceType)} terminée.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de convertir ce fichier.');
      setDraft(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownload = () => {
    if (!draft || !selectedFile) {
      return;
    }
    const baseName = selectedFile.name.replace(/\.[^.]+$/, '') || 'systeme_importe';
    downloadTextFile(`${baseName}.system-draft.json`, formatJson(draft));
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Outils</h1>
        <p style={{ marginBottom: 0 }}>
          Ici, on regroupe les utilitaires auteurs. Les convertisseurs documentaires sont utilisables directement via
          formulaire, sans passer par le terminal.
        </p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Convertir un document en JSON système</h2>
        <p>
          Le résultat est un fichier <code>nexusforge.system-draft</code> contenant une proposition de
          <code>studioSchemaV2</code> et le détail des éléments détectés.
        </p>
        <div className="grid" style={{ alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Outil de conversion</span>
            <select
              value={sourceType}
              onChange={(event) =>
                setSourceType(
                  event.target.value === 'pdf'
                    ? 'pdf'
                    : event.target.value === 'html_enriched'
                    ? 'html_enriched'
                    : 'html'
                )
              }
            >
              <option value="html">HTML</option>
              <option value="html_enriched">HTML enrichi</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Fichier</span>
            <input
              type="file"
              accept={sourceType === 'pdf' ? '.pdf,application/pdf' : '.html,.htm,text/html'}
              onChange={handleFileChange}
            />
          </label>
        </div>
        <p style={{ marginBottom: 0 }}>
          {sourceType === 'html'
            ? 'Mode stable : une vue unique, structurée proprement à partir du HTML.'
            : sourceType === 'html_enriched'
            ? 'Mode enrichi : plusieurs vues + une navigation par onglets sont générées automatiquement.'
            : 'Mode PDF : extraction heuristique du texte et des champs potentiels.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Button type="button" onClick={() => void handleConvert()} disabled={isConverting}>
            {isConverting ? 'Conversion...' : 'Convertir'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleDownload} disabled={!draft}>
            Télécharger le JSON
          </Button>
        </div>
        {selectedFile ? <p style={{ marginBottom: 0 }}>Fichier sélectionné : {selectedFile.name}</p> : null}
        {statusMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ color: '#b42318', marginBottom: 0 }}>{errorMessage}</p> : null}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Aperçu JSON</h2>
        <p>Le JSON généré peut ensuite servir de base de travail ou être traité par un futur import système complet.</p>
        <textarea
          value={jsonPreview}
          readOnly
          placeholder="Le JSON généré s affichera ici."
          rows={20}
          style={{ width: '100%', fontFamily: 'monospace', resize: 'vertical' }}
        />
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Import / export de vue</h2>
        <p>
          L import / export natif de vue reste dans le Studio Systeme. Il sert à échanger une vue entre systèmes, sans
          passer par le convertisseur documentaire.
        </p>
        <Link to="/systems">
          <Button type="button">Ouvrir le Studio Systeme</Button>
        </Link>
      </section>
    </Layout>
  );
}
