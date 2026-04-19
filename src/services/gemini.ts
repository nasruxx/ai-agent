import { GoogleGenAI } from "@google/genai";
import { Attachment, KnowledgeBase, AISettings } from "../types.ts";

const defaultApiKey = process.env.GEMINI_API_KEY || "";
const defaultModel = "gemini-3-flash-preview";

export async function* sendMessageStream(
  history: { role: 'user' | 'model', parts: ({ text: string } | { inlineData: { mimeType: string, data: string } })[] }[], 
  message: string,
  attachments?: Attachment[],
  knowledgeBase?: KnowledgeBase,
  aiSettings?: AISettings
) {
  try {
    const activeKey = aiSettings?.apiKey || defaultApiKey;
    const activeModel = aiSettings?.model || defaultModel;
    
    if (!activeKey) {
      yield "Kesalahan: API Key tidak ditemukan. Silakan atur di pengaturan.";
      return;
    }

    const ai = new GoogleGenAI({ apiKey: activeKey });
    
    let systemText = "You are Aura, a helpful and intelligent AI assistant. You speak Indonesian (Bahasa Indonesia) fluently. Be concise, friendly, and smart. You can analyze images and documents provided by the user.";
    
    if (knowledgeBase?.text) {
      systemText += `\n\nBERIKUT ADALAH BASIS PENGETAHUAN TAMBAHAN ANDA:\n${knowledgeBase.text}\n\nGunakan pengetahuan ini untuk menjawab pertanyaan jika relevan.`;
    }

    const chat = ai.chats.create({
      model: activeModel,
      config: {
        systemInstruction: systemText,
      },
      history: history,
    });

    const parts: any[] = [];
    
    // Always check for knowledge base images. 
    // If history is empty, prepend them to the first message.
    // Note: In this implementation, history is rebuilt in App.tsx every time.
    // If the knowledge is meant to be global, we should ensure the model "sees" it.
    if (knowledgeBase?.images && knowledgeBase.images.length > 0) {
      const hasKnowledgeInHistory = history.some(h => 
        h.parts.some(p => (p as any).text?.includes("Basis Pengetahuan"))
      );

      if (!hasKnowledgeInHistory) {
        parts.push({
          text: "KONTEKS BASIS PENGETAHUAN (Gambar & Teks):\n" +
                "Anda memiliki akses ke referensi visual di bawah ini. " +
                "Jika Anda ingin menampilkan gambar rujukan di dalam jawaban Anda, gunakan kode [[KB_IMAGE:indeks]] (misal [[KB_IMAGE:0]] untuk gambar pertama, [[KB_IMAGE:1]] untuk kedua, dst).\n"
        });
        
        knowledgeBase.images.forEach((img, idx) => {
          if (img.base64) {
            parts.push({ text: `Gambar Indeks ${idx}:` });
            parts.push({
              inlineData: {
                mimeType: img.type,
                data: img.base64.split(',')[1]
              }
            });
          }
        });
        parts.push({ text: "\n---\n" });
      }
    }

    // Ensure message text is never empty to avoid API errors
    parts.push({ text: message.trim() || "(Gambar/Dokumen Terlampir)" });
    
    if (attachments) {
      attachments.forEach(att => {
        if (att.base64) {
          parts.push({
            inlineData: {
              mimeType: att.type,
              data: att.base64.split(',')[1]
            }
          });
        }
      });
    }

    const result = await chat.sendMessageStream({ message: parts });

    for await (const chunk of result) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Error in Gemini service:", error);
    yield "Maaf, terjadi kesalahan saat menghubungi server AI. Silakan coba lagi.";
  }
}

export async function generateTitle(message: string, aiSettings?: AISettings): Promise<string> {
    try {
        const activeKey = aiSettings?.apiKey || defaultApiKey;
        const activeModel = aiSettings?.model || defaultModel;

        if (!activeKey) return "Percakapan Baru";

        const ai = new GoogleGenAI({ apiKey: activeKey });
        const response = await ai.models.generateContent({
            model: activeModel,
            contents: `Beri judul singkat (maksimal 4 kata) untuk percakapan yang diawali dengan: "${message}"`,
        });
        return response.text?.replace(/"/g, '').trim() || "Percakapan Baru";
    } catch (error) {
        console.error("Error generating title:", error);
        return "Percakapan Baru";
    }
}

export async function sendMessage(
  message: string,
  history: any[] = [],
  knowledgeBase?: KnowledgeBase,
  aiSettings?: AISettings
): Promise<string> {
  try {
    const activeKey = aiSettings?.apiKey || defaultApiKey;
    const activeModel = aiSettings?.model || defaultModel;
    
    if (!activeKey) return "Error: No API Key.";

    const ai = new GoogleGenAI({ apiKey: activeKey });
    let systemText = "You are Aura, a helpful and intelligent AI assistant. You speak Indonesian (Bahasa Indonesia) fluently. Be concise, friendly, and smart.";
    
    if (knowledgeBase?.text) {
      systemText += `\n\nKONTeks: ${knowledgeBase.text}`;
    }

    const chat = ai.chats.create({
      model: activeModel,
      config: { systemInstruction: systemText },
      history: history,
    });

    const result = await chat.sendMessage({ message: message });
    return result.text || "Maaf, saya tidak bisa merespons saat ini.";
  } catch (error) {
    console.error("Error in Gemini sendMessage:", error);
    return "Maaf, terjadi kesalahan internal.";
  }
}
