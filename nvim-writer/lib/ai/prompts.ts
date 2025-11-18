export const FEEDBACK_PROMPTS = {
  general: (text: string) => `Provide concise feedback on this text to improve clarity, grammar, and style:\n\n"${text}"\n\nFormat your response as a bulleted list of 2-4 specific, actionable suggestions.`,

  grammar: (text: string) => `Check this text for grammar, spelling, and punctuation errors:\n\n"${text}"\n\nList only the errors you find with corrections.`,

  clarity: (text: string) => `Analyze this text for clarity and readability:\n\n"${text}"\n\nSuggest 2-3 ways to make it clearer and more concise.`,

  structure: (text: string) => `Evaluate the structure and flow of this text:\n\n"${text}"\n\nSuggest improvements to organization and logical flow.`,
}
