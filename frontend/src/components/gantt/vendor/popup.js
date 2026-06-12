/*
 * Vendored from frappe-gantt v1.2.2 (MIT) — 変更点は ./README.md を参照。
 * show() をビューポート基準（position:fixed）の配置に変更している。
 */
export default class Popup {
    constructor(parent, popup_func, gantt) {
        this.parent = parent;
        this.popup_func = popup_func;
        this.gantt = gantt;

        this.make();
    }

    make() {
        this.parent.innerHTML = `
            <div class="title"></div>
            <div class="subtitle"></div>
            <div class="details"></div>
            <div class="actions"></div>
        `;
        this.hide();

        this.title = this.parent.querySelector('.title');
        this.subtitle = this.parent.querySelector('.subtitle');
        this.details = this.parent.querySelector('.details');
        this.actions = this.parent.querySelector('.actions');
    }

    // 変更（vendor）: clientX/clientY（ビューポート基準のカーソル位置）を受け取り、
    // CSS 側で position:fixed にした .popup-wrapper をビューポート基準で配置する。
    // 既定はカーソルの右上。右端/下端で画面からはみ出す場合は左/上に反転する。
    // これによりコンテナ（.gantt-container）の overflow に切られない。
    show({ x, y, task, target, clientX, clientY }) {
        this.actions.innerHTML = '';
        let html = this.popup_func({
            task,
            chart: this.gantt,
            get_title: () => this.title,
            set_title: (title) => (this.title.innerHTML = title),
            get_subtitle: () => this.subtitle,
            set_subtitle: (subtitle) => (this.subtitle.innerHTML = subtitle),
            get_details: () => this.details,
            set_details: (details) => (this.details.innerHTML = details),
            add_action: (html, func) => {
                let action = this.gantt.create_el({
                    classes: 'action-btn',
                    type: 'button',
                    append_to: this.actions,
                });
                if (typeof html === 'function') html = html(task);
                action.innerHTML = html;
                action.onclick = (e) => func(task, this.gantt, e);
            },
        });
        if (html === false) return;
        if (html) this.parent.innerHTML = html;

        if (this.actions.innerHTML === '') this.actions.remove();
        else this.parent.appendChild(this.actions);

        // 変更（vendor）: 先に表示してサイズを測り、ビューポート基準で配置。
        // clientX/clientY が来ない呼び出し（後方互換）は x/y を流用する。
        this.parent.classList.remove('hide');
        const cx = clientX ?? x;
        const cy = clientY ?? y;
        const { width, height } = this.parent.getBoundingClientRect();
        // 既定: カーソルの右上。
        let left = cx + 12;
        let top = cy - height - 10;
        // 右端ではみ出すなら左に反転。
        if (left + width > window.innerWidth - 4) left = cx - width - 12;
        // 上端ではみ出すなら下に反転。
        if (top < 4) top = cy + 12;
        // 下端でもはみ出すならビューポート内に収める。
        if (top + height > window.innerHeight - 4)
            top = Math.max(4, window.innerHeight - height - 4);
        if (left < 4) left = 4;
        this.parent.style.left = left + 'px';
        this.parent.style.top = top + 'px';
    }

    hide() {
        this.parent.classList.add('hide');
    }
}
