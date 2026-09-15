
export class Notice
{
	private static container: HTMLElement;
	public notification: HTMLElement;

	constructor(public message: string, public duration: number = 5000)
	{
		this.show();
	}

	public show()
	{
		if (!Notice.container)
		{
			Notice.container = document.createElement("div");
			Notice.container.classList.add("notice-container");
			Object.assign(Notice.container.style, { top: "0", right: "0" });
			document.body.appendChild(Notice.container);
		}

		this.notification = document.createElement("div");
		this.notification.classList.add("notice");
		this.notification.innerText = this.message;
		Notice.container.appendChild(this.notification);

		// slide in from left
		Object.assign(this.notification.style, { opacity: "0", transform: "translateX(350px)", transition: "all 0.5s" });
		setTimeout(() =>
		{
			Object.assign(this.notification.style, {
				opacity: "1",
				transform: "translateX(0)",
				height: this.notification.scrollHeight + "px",
			});
		}, 100);

		// slide up
		setTimeout(() =>
		{
			this.dismiss();
		}, this.duration);

		// dismiss on click
		this.notification.addEventListener("click", () =>
		{
			this.dismiss();
		}, { once: true });
	}

	public dismiss()
	{
		if (!this.notification) return;
		Object.assign(this.notification.style, { opacity: "0", height: "0", margin: "0", padding: "0" });
		setTimeout(() =>
		{
			this.notification.remove();
		}, 500);
	}
}
