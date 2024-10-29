$(function () {
    const clipboard = new ClipboardJS('.copy-btn')
    clipboard.on("success", function (e) {
        $(e.trigger).attr('data-tooltip', "Copied")
    })
    clipboard.on("error", function (e) {
        $(e.trigger).attr('data-tooltip', "Copy")
    })
})