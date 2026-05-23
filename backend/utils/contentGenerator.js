import Anthropic from '@anthropic-ai/sdk';

const styleMap = {
  engaging: 'engageant et accrocheur avec des emojis pertinents',
  pro: 'professionnel et informatif',
  humorous: 'humoristique et décontracté',
  inspirational: 'inspirant et motivant',
};

const lengthMap = {
  short: 'très court, 1-2 phrases (max 150 caractères)',
  medium: '3-4 phrases (max 300 caractères)',
  long: 'paragraphe complet (max 500 caractères)',
};

function getClient() {
  if (!process.env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY === 'your_claude_api_key') {
    throw new Error('CLAUDE_API_KEY non configuré dans .env');
  }
  return new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
}

export async function generatePost(topic, style = 'engaging', length = 'medium') {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Génère un post pour les réseaux sociaux sur: "${topic}".
Style: ${styleMap[style] || style}
Longueur: ${lengthMap[length] || length}

Réponds UNIQUEMENT avec ce JSON (sans markdown):
{
  "post": "texte du post",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "description": "description courte pour YouTube (1 phrase)"
}`,
    }],
  });

  const text = message.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Réponse IA invalide - JSON non trouvé');
  return JSON.parse(match[0]);
}

export async function generateIdeas(topic, count = 5) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Génère exactement ${count} idées créatives de posts/vidéos pour les réseaux sociaux sur: "${topic}".
Réponds UNIQUEMENT avec un tableau JSON (sans markdown): ["idée 1", "idée 2", ...]`,
    }],
  });

  const text = message.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Réponse IA invalide - tableau JSON non trouvé');
  return JSON.parse(match[0]);
}
