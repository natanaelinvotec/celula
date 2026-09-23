// ia.js — leitura do pedido médico com Gemini (Firebase AI Logic · Gemini Developer API).
// Tentativas com espera crescente e modelo reserva; resposta sempre validada como JSON.
import { app } from './firebase.js';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-ai.js';

const ai = getAI(app, { backend: new GoogleAIBackend() });
export const MODELOS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

const PROMPT = `Você é a recepção de um laboratório de análises clínicas no Brasil e está lendo a FOTO de um pedido médico (impresso ou manuscrito, em português).
Tarefa: extrair TODOS os exames laboratoriais solicitados, na ordem em que aparecem.
Regras:
- "texto": copie exatamente como está escrito (abreviações, erros, siglas), sem corrigir.
- "normalizado": nome completo padrão do exame em MAIÚSCULAS sem acento (ex.: "Hb glic" -> "HEMOGLOBINA GLICADA", "Vit D" -> "VITAMINA D 25 HIDROXI", "TGP" -> "TRANSAMINASE PIRUVICA TGP", "Anti HCV" -> "HEPATITE C ANTICORPOS", "Ureia pos HD" -> "UREIA POS HEMODIALISE").
- "confianca": 0 a 1 — quanto você tem certeza da LEITURA da caligrafia (não da existência do exame).
- Um exame por item; "perfil lipídico" vira 4 itens (COLESTEROL TOTAL, HDL, LDL, TRIGLICERIDEOS); "função renal" vira UREIA e CREATININA; "eletrólitos" vira SODIO e POTASSIO.
- Ignore medicamentos, diagnósticos, CID e orientações. Não invente exames.
- Se o pedido indicar contexto de nefrologia/hemodiálise/renal, marque "renal": true.
Responda SOMENTE o JSON: {"paciente":string|null,"medico":string|null,"crm":string|null,"data":string|null,"renal":boolean,"exames":[{"texto":string,"normalizado":string,"confianca":number}]}`;

const dorme = ms => new Promise(r => setTimeout(r, ms));

/**
 * Lê uma ou mais imagens (dataURL JPEG/PNG) e devolve { paciente, medico, exames:[...], modelo, ms }.
 * onStatus(texto) recebe mensagens de progresso para a tela.
 */
export async function lerPedido(dataUrls, { onStatus = () => {}, tentativas = 4 } = {}) {
  const parts = [{ text: PROMPT }, ...dataUrls.map(u => ({ inlineData: { mimeType: u.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', data: u.split(',')[1] } }))];
  let ultimoErro, quota = false;
  for (let i = 0; i < tentativas; i++) {
    quota = false;
    for (const nome of MODELOS) {
      try {
        onStatus(`Lendo o pedido com ${nome}${i ? ` (tentativa ${i + 1})` : ''}…`);
        // Sem responseMimeType: no nível gratuito o modo JSON estruturado devolve 500 com imagens; o JSON vem pelo prompt.
        const model = getGenerativeModel(ai, { model: nome, generationConfig: { temperature: 0.1, maxOutputTokens: 4096 } });
        const t0 = Date.now();
        const r = await model.generateContent(parts);
        const json = extrairJson(r.response.text());
        if (!json || !Array.isArray(json.exames)) throw new Error('Resposta da IA sem lista de exames');
        json.exames = json.exames.filter(e => e && e.texto).map(e => ({ texto: String(e.texto).trim(), normalizado: String(e.normalizado || e.texto).trim().toUpperCase(), confianca: Math.max(0, Math.min(1, Number(e.confianca) || 0.5)) }));
        return { ...json, modelo: nome, ms: Date.now() - t0, tokens: r.response.usageMetadata?.totalTokenCount };
      } catch (e) {
        ultimoErro = e; const msg = String(e.message || e);
        if (/404|not found|no longer available/i.test(msg)) continue;          // modelo indisponível: próximo
        if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) { quota = true; onStatus(`Cota do modelo ${nome} esgotada — tentando o modelo reserva…`); continue; }
        if (/500|503|high demand|overloaded|fetch/i.test(msg)) continue;      // instável: tenta o reserva
        throw e;
      }
    }
    if (quota && i >= 1) break; // cota diária: não adianta insistir
    onStatus(`Serviço de IA ocupado, nova tentativa em ${3 * (i + 1)} s…`); await dorme(3000 * (i + 1));
  }
  if (quota) throw new Error('A cota gratuita da IA (Gemini) foi atingida. Ela renova à meia-noite (horário do Pacífico, 04:00 em Campo Grande). Para não parar a recepção, ative o plano Blaze no Firebase. Enquanto isso, adicione os exames pela busca manual.');
  throw new Error('A IA não respondeu após várias tentativas. Você pode digitar os exames manualmente. (' + String(ultimoErro?.message || '').slice(0, 120) + ')');
}

function extrairJson(txt) {
  txt = String(txt || '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(txt); } catch {}
  const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
