import { state } from '../store/app_state.js';

export function applyDynamicCSS() {
    let styleTag = document.getElementById('dynamic-type-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-type-styles';
        document.head.appendChild(styleTag);
    }

    let css = '';
    state.types.forEach(t => {
        css += `.type-style-${t.id} { ${t.customCSS} }\n`;
    });
    styleTag.innerHTML = css;
}