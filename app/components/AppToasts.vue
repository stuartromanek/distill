<script setup lang="ts">
const { toasts, dismissToast } = useToast()
</script>

<template>
  <Teleport to="body">
    <div v-if="toasts.length" class="app-toasts" aria-live="polite" aria-relevant="additions">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        box-="round"
        shear-="top"
        class="app-toast"
        :class="`app-toast--${toast.variant}`"
      >
        <span is-="badge" cap-="square" :variant-="toast.variant === 'error' ? 'not-found' : 'foreground2'">
          {{ toast.variant === 'error' ? 'Issue' : 'Note' }}
        </span>
        <p>
          {{ toast.message }}
          <template v-if="toast.href">
            ·
            <a
              :href="toast.href"
              class="text-link"
              target="_blank"
              rel="noopener noreferrer"
              @click="dismissToast(toast.id)"
            >
              {{ toast.linkLabel ?? 'Open' }}
            </a>
          </template>
        </p>
        <button
          type="button"
          size-="small"
          box-="round"
          class="app-toast__close"
          aria-label="Dismiss message"
          @click="dismissToast(toast.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-toasts {
  position: fixed;
  right: var(--app-gutter, 2ch);
  bottom: 2lh;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.5lh;
  width: min(44ch, calc(100vw - 2 * var(--app-gutter, 2ch)));
  pointer-events: none;
}

.app-toast {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1ch;
  padding: 0 1ch 0.75lh;
  background: var(--background0);
  pointer-events: auto;
  animation: toast-enter 0.22s cubic-bezier(0.2, 0, 0, 1) both;
}

.app-toast p {
  min-width: 0;
  margin: 0;
  text-wrap: pretty;
}

.app-toast__close {
  padding-inline: 1ch;
}

@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
