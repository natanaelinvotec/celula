// ia.js — leitura do pedido médico com Gemini (Firebase AI Logic · Agent Platform / Vertex AI Gemini API).
// Cobrado direto no plano Blaze (pagamento por uso), sem cota diária gratuita nem pré-pagamento no AI Studio.
// Tentativas com espera crescente e modelo reserva; resposta sempre validada como JSON.
import { app } from './firebase.js';
import { getAI, getGenerativeModel, VertexAIBackend } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-ai.js';

// Local "global": único onde os modelos gemini-3.x estão publicados para este projeto.
const ai = getAI(app, { backend: new VertexAIBackend('global') });
export const MODELOS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

const PROMPT = `Você é a recepção de um laboratório de análises clínicas no Brasil e está lendo a FOTO de um pedido médico (impresso ou manuscrito, em português).
Tarefa: extrair TODOS os exames laboratoriais solicitados, na ordem em que aparecem.
Regras:
- "texto": copie exatamente como está escrito (abreviações, erros, siglas), sem corrigir.
- "normalizado": nome completo padrão do exame em MAIÚSCULAS sem acento (ex.: "Hb glic" -> "HEMOGLOBINA GLICADA", "Vit D" -> "VITAMINA D 25 HIDROXI", "Vit B12" -> "VITAMINA B12", "TGP" -> "TRANSAMINASE PIRUVICA TGP", "Anti HCV" -> "HEPATITE C ANTICORPOS", "Insulina basal" -> "INSULINA", "Anti-Tireoglobulina" -> "ANTICORPOS ANTI TIREOGLOBULINA", "Ureia pos HD" -> "UREIA POS HEMODIALISE").
- "confianca": 0 a 1 — quanto você tem certeza da LEITURA da caligrafia (não da existência do exame). Caligrafia difícil: dê a leitura mais provável com confianca baixa (0.3 a 0.6) em vez de omitir o exame.
- Em guias impressas com caixinhas, inclua SÓ os itens marcados (X, ✓, risco) e TODAS as linhas manuscritas nos campos "OUTROS", "OBS" ou nas margens — cada linha manuscrita costuma ser um exame (ex.: "Vit B12", "Vit D", "Insulina basal", "Ferritina"). Nunca deixe uma linha manuscrita de fora.
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
        // No backend Vertex o modo JSON estruturado funciona com imagens: resposta já vem em JSON puro.
        const model = getGenerativeModel(ai, { model: nome, generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' } });
        const t0 = Date.now();
        const r = await model.generateContent(parts);
        const json = extrairJson(r.response.text());
        if (!json || !Array.isArray(json.exames)) throw new Error('Resposta da IA sem lista de exames');
        json.exames = json.exames.filter(e => e && e.texto).map(e => ({ texto: String(e.texto).trim(), normalizado: String(e.normalizado || e.texto).trim().toUpperCase(), confianca: Math.max(0, Math.min(1, Number(e.confianca) || 0.5)) }));
        return { ...json, modelo: nome, ms: Date.now() - t0, tokens: r.response.usageMetadata?.totalTokenCount };
      } catch (e) {
        ultimoErro = e; const msg = String(e.message || e);
        if (/404|not found|no longer available/i.test(msg)) continue;          // modelo indisponível: próximo
        // 429 no Vertex é "Resource exhausted" momentâneo (capacidade compartilhada): passa pro reserva e repete em seguida
        if (/429|quota|RESOURCE_EXHAUSTED|resource exhausted/i.test(msg)) { quota = true; onStatus(`Modelo ${nome} ocupado — tentando o modelo reserva…`); continue; }
        if (/500|503|high demand|overloaded|fetch/i.test(msg)) continue;      // instável: tenta o reserva
        throw e;
      }
    }
    onStatus(`Serviço de IA ocupado, nova tentativa em ${2 * (i + 1)} s…`); await dorme(2000 * (i + 1));
  }
  if (quota) throw new Error('O limite de uso da IA (Gemini) foi atingido neste momento. Aguarde um minuto e tente de novo; se persistir, verifique o faturamento do projeto CelulaMS no Firebase. Enquanto isso, adicione os exames pela busca manual.');
  throw new Error('A IA não respondeu após várias tentativas. Você pode digitar os exames manualmente. (' + String(ultimoErro?.message || '').slice(0, 120) + ')');
}

function extrairJson(txt) {
  txt = String(txt || '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(txt); } catch {}
  const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
