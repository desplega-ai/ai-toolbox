// Anthropic Claude for invoice classification
client<llm> InvoiceClassifier {
  provider anthropic
  options {
    model "claude-haiku-4-5"
    api_key env.ANTHROPIC_API_KEY
  }
}

retry_policy Exponential {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 1.5
    max_delay_ms 10000
  }
}
