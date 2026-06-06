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

export interface MermaidFlowParseResult {
  roles: Array<{ name: string; type?: 'HUMAN' | 'SYSTEM' | 'OTHER' }>;
  nodes: Array<{
    key: string;
    label: string;
    type?: string;
    roleName?: string;
  }>;
  edges: Array<{ sourceKey: string; targetKey: string; label?: string }>;
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

  /**
   * Mermaid（flowchart）図を業務フローのロール・ノード・エッジに変換
   */
  async parseMermaidToFlow(
    mermaid: string,
    apiKey: string,
  ): Promise<MermaidFlowParseResult> {
    const client = this.getClient(apiKey);

    const systemPrompt = `あなたは業務フロー図の解析の専門家です。
与えられた Mermaid の flowchart 図を、スイムレーン業務フロー用の「ロール（役割／レーン）」「ノード」「エッジ」に変換してください。

出力は必ず以下のJSON形式で返してください：
{
  "roles": [
    { "name": "ロール名（レーン名）", "type": "HUMAN | SYSTEM | OTHER" }
  ],
  "nodes": [
    { "key": "mermaidのノードID", "label": "ノードのラベル", "type": "START | END | PROCESS | DECISION | SYSTEM_INTEGRATION | MANUAL_OPERATION | DATA_STORE", "roleName": "所属するロール名" }
  ],
  "edges": [
    { "sourceKey": "始点ノードID", "targetKey": "終点ノードID", "label": "遷移ラベル（任意）" }
  ]
}

解析ルール：
1. node.key は Mermaid のノードID（例: A, node1）をそのまま使う。
2. label は Mermaid のノードに書かれた表示テキスト（["..."], ("..."), {"..."} などの中身）を使う。
3. subgraph やラベル（例: [担当者名] のような注記、subgraphタイトル）からスイムレーンのロールを推測する。ロールが明示されていなければ妥当な単一ロール（例: "担当者"）を1つ作り、全ノードをそれに割り当てる。
4. node.type は形状から推測する：開始/終了の丸は START/END、ひし形({})は DECISION、円柱([(...)])は DATA_STORE、それ以外の四角は PROCESS。判断できなければ PROCESS。
5. roleName は roles の name と一致させる。type（ロール）はシステム/外部システムなら SYSTEM、人手の操作なら HUMAN、判断できなければ HUMAN。
6. edges は Mermaid の矢印（-->, -->|label| など）から抽出し、label がある場合のみ含める。
7. 必ず有効なJSONのみを出力する（説明文・コードフェンス以外の文章は不要）。`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `以下の Mermaid 図を業務フローに変換してください：

${mermaid}`,
        },
      ],
      system: systemPrompt,
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
      const result = JSON.parse(jsonText.trim());
      return {
        roles: Array.isArray(result.roles) ? result.roles : [],
        nodes: Array.isArray(result.nodes) ? result.nodes : [],
        edges: Array.isArray(result.edges) ? result.edges : [],
      } as MermaidFlowParseResult;
    } catch (err) {
      console.error('JSON parse error:', textContent.text);
      throw new Error('Mermaid図の解析に失敗しました');
    }
  }
}

