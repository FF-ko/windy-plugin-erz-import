<div
    class="erz-drop"
    class:erz-drop--over={isOver}
    role="region"
    aria-label="ERZ file drop area"
    on:dragover|preventDefault={() => (isOver = true)}
    on:dragleave={() => (isOver = false)}
    on:drop|preventDefault={handleDrop}
>
    <div class="erz-drop__icon">⛵</div>
    <div class="erz-drop__hint">Drop an ERZ routing file here</div>

    <label class="button button--variant-orange size-s">
        Choose file
        <input type="file" accept=".erz,.erz10,.gz" on:change={handleSelect} />
    </label>
</div>

<script lang="ts">
    export let onFile: (file: File) => void;

    let isOver = false;

    const handleDrop = (event: DragEvent) => {
        isOver = false;

        const file = event.dataTransfer?.files?.[0];
        if (file) {
            onFile(file);
        }
    };

    const handleSelect = (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];

        if (file) {
            onFile(file);
        }

        // Reset so picking the same file again still fires a change event.
        input.value = '';
    };
</script>

<style lang="less">
    .erz-drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 26px 16px;
        border: 2px dashed rgba(255, 255, 255, 0.35);
        border-radius: 8px;
        text-align: center;
        transition: border-color 0.15s, background-color 0.15s;

        &--over {
            border-color: #ff8c00;
            background-color: rgba(255, 140, 0, 0.12);
        }

        &__icon {
            font-size: 28px;
            line-height: 1;
        }

        &__hint {
            opacity: 0.75;
        }

        input {
            display: none;
        }
    }
</style>
