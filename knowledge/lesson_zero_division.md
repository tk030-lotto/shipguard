---
type: lesson-candidate
title: 0除算時のValueError例外送出規約
source: hermes-memory
category: knowledge
tags: [python, exception-handling, division, valueerror, specification]
status: approved
promoted_at: "2026-09-13T17:03:56.149111+09:00"
promoted_by: antigravity-approved
---

## 概要
計算モジュールにおいて分母が 0（0除算）の場合、**`ZeroDivisionError` ではなく必ず `ValueError("Cannot divide by zero")` を送出する。**

## 背景・理由
- プロジェクト統一例外処理仕様に基づく
- `ZeroDivisionError` は Python 標準の組み込み例外だが、プロジェクト全体で「計算エラー＝ `ValueError`」として統一することで：
  - 例外ハンドリングの一貫性が保たれる
  - 上位レイヤーでの `except ValueError` で全計算エラーを捕捉可能
  - エラーメッセージのフォーマット統一（「Cannot divide by zero」固定文言）
- ドメインロジックとしての「無効な引数」を表現する方が意味論的に適切

## 規約
```python
# Bad
def divide(a, b):
    return a / b  # ZeroDivisionError が送出される

# Good
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
```

## 適用範囲
- すべての計算・数値演算モジュール
- 割り算、モジュロ演算、平均計算等、分母が 0 になりうる全演算
- ライブラリ内部で `ZeroDivisionError` を捕捉し `ValueError` に変換して再送出するパターンも可

## 関連
- プロジェクト共通例外基底クラス（存在する場合）との整合性確認
- テストでは `pytest.raises(ValueError, match="Cannot divide by zero")` で検証