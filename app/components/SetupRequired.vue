<script setup lang="ts">
export type SetupIssue = {
  id: string
  envVar: string
  message: string
  hint?: string
}

defineProps<{
  issues: SetupIssue[]
}>()
</script>

<template>
  <section class="connect">
    <section box-="round" shear-="top" class="connect__section">
      <header class="connect__header">
        <div class="box-header">
          <span is-="badge" cap-="square">Configuration</span>
        </div>
        <div class="connect__copy">
          <h2>Setup required</h2>
          <p class="muted">
            Add the missing values to <EnvVarText text=".env" />, then restart the server.
          </p>
        </div>
      </header>

      <ul class="setup-required__list">
        <li
          v-for="issue in issues"
          :key="issue.id"
          box-="round"
          class="setup-required__item"
        >
          <span is-="badge" cap-="square" class="setup-required__var">{{ issue.envVar }}</span>
          <p class="setup-required__message">
            <EnvVarText :text="issue.message" />
          </p>
          <p v-if="issue.hint" class="muted setup-required__hint">
            <EnvVarText :text="issue.hint" />
          </p>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.connect {
  display: flex;
  flex-direction: column;
  gap: 1lh;
}

.connect__section {
  display: flex;
  flex-direction: column;
  gap: 1lh;
  padding: 0 1ch 1lh;
  background: var(--background0);
}

.connect__header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75lh;
}

.connect__copy {
  display: flex;
  flex-direction: column;
  gap: 0.25lh;
  padding-inline: 1ch;
}

.connect__copy h2,
.connect__copy p {
  margin: 0;
}

.setup-required__list {
  display: flex;
  flex-direction: column;
  gap: 0.75lh;
  margin: 0;
  padding: 0 1ch;
  list-style: none;
}

.setup-required__item {
  display: flex;
  flex-direction: column;
  gap: 0.35lh;
  padding: 0.75lh 1ch;
  background: var(--background1);
}

.setup-required__var {
  align-self: flex-start;
}

.setup-required__message {
  margin: 0;
  line-height: 1.35;
}

.setup-required__hint {
  margin: 0;
  font-size: 0.9em;
  line-height: 1.35;
}
</style>
