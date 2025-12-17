import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface RequirementParseResult {
  requirements: Array<{
    title: string;
    description: string;
    type: 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'BUSINESS_RULE' | 'CONSTRAINT' | 'INTERFACE' | 'DATA';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    children?: RequirementParseResult['requirements'];
  }>;
}

@Injectable()
export class ClaudeService {
  private getClient(apiKey: string): Anthropic {
    return new Anthropic({ apiKey });
  }

  /**
   * 自然言語を要求定義に変換
   */
  async parseRequirements(
    naturalLanguageText: string,
    apiKey: string,
  ): Promise<RequirementParseResult> {
    const client = this.getClient(apiKey);

    const systemPrompt = `あなたはシステム開発の要求分析の専門家です。
ユーザーが入力した自然言語のテキストを、システム開発用の要求定義に変換してください。

出力は必ず以下のJSON形式で返してください：
{
  "requirements": [
    {
      "title": "要求のタイトル（簡潔に）",
      "description": "要求の詳細説明（具体的に、測定可能な形で）",
      "type": "FUNCTIONAL | NON_FUNCTIONAL | BUSINESS_RULE | CONSTRAINT | INTERFACE | DATA",
      "priority": "HIGH | MEDIUM | LOW",
      "children": [
        // 子要求がある場合は同じ構造でネスト
      ]
    }
  ]
}

要求タイプの説明：
- FUNCTIONAL: システムが実行すべき機能
- NON_FUNCTIONAL: 性能、セキュリティ、可用性などの品質要求
- BUSINESS_RULE: ビジネスロジックやルール
- CONSTRAINT: 制約条件
- INTERFACE: 外部システムとの連携
- DATA: データに関する要求

注意点：
1. 曖昧な表現は具体的な要求に変換する
2. 大きな要求は階層構造で分解する
3. 測定可能で検証可能な形で記述する
4. 必ず有効なJSONのみを出力する（説明文は不要）`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `以下のテキストを要求定義に変換してください：

${naturalLanguageText}`,
        },
      ],
      system: systemPrompt,
    });

    // レスポンスからテキストを抽出
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude APIからの応答が不正です');
    }

    // JSONをパース
    try {
      // JSONブロックを抽出（```json ... ``` の形式も対応）
      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      
      const result = JSON.parse(jsonText.trim());
      return result as RequirementParseResult;
    } catch (err) {
      console.error('JSON parse error:', textContent.text);
      throw new Error('要求定義の解析に失敗しました');
    }
  }

  /**
   * 要求を詳細化する
   */
  async refineRequirement(
    requirement: { title: string; description: string },
    context: string,
    apiKey: string,
  ): Promise<{ description: string; acceptanceCriteria: string[] }> {
    const client = this.getClient(apiKey);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `以下の要求をより詳細に記述し、受け入れ基準を作成してください。

要求タイトル: ${requirement.title}
現在の説明: ${requirement.description}
コンテキスト: ${context}

以下のJSON形式で出力してください：
{
  "description": "詳細な説明",
  "acceptanceCriteria": ["基準1", "基準2", ...]
}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude APIからの応答が不正です');
    }

    try {
      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      return JSON.parse(jsonText.trim());
    } catch (err) {
      throw new Error('要求詳細化の解析に失敗しました');
    }
  }
}

