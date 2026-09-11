<script setup lang="ts">
const ENV_VAR_PATTERN = /\.env|[A-Z][A-Z0-9_]+/g

type TextPart = { kind: 'text' | 'var'; value: string }

function partsFor(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0

  for (const match of text.matchAll(ENV_VAR_PATTERN)) {
    const index = match.index!
    if (index > last) {
      parts.push({ kind: 'text', value: text.slice(last, index) })
    }
    parts.push({ kind: 'var', value: match[0] })
    last = index + match[0].length
  }

  if (last < text.length) {
    parts.push({ kind: 'text', value: text.slice(last) })
  }

  return parts
}

const props = defineProps<{
  text: string
}>()

const parts = computed(() => partsFor(props.text))
</script>

<template>
  <span class="env-var-text">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.kind === 'var'" class="env-var-pill">{{ part.value }}</span>
      <template v-else>{{ part.value }}</template>
    </template>
  </span>
</template>
