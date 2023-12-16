!async function() {
    let e = document.querySelectorAll(".cvocp-quiz-item.cvocp-quiz-course-theme"),
        t = 4;
    document.getElementById("cvocp-quiz-submit-button");
    let i = {},
        o = {};
    for (ques of e) {
        let c = ques.dataset.qstnNid;
        i[c] = [], t = ques.querySelectorAll("div div div[data-part='choice-item']").length;
        for (let a = 0; a < t; a++) i[c].push(document.getElementById("choice-qstn-" + c + "-" + a).value);
        o[c] = 0
    }
    async function l(e) { for (let t in data = { nid: $("#cvocp-quiz-header").attr("data-nid"), sid: $("#cvocp-quiz-session").val() }, e) data["answer_" + t] = i[t][e[t]], document.getElementById("choice-qstn-" + t + "-" + e[t]).click(); return await (await fetch("?q=cvocp/ajax/submitquizanswer", { method: "POST", body: new URLSearchParams(data) })).json() }
    for (let r = 0; r < t; r++) {
        for (let s in (res = await l(o)).result) "0" == res.result[s] && o[s]++;
        if (res.score == res.scoretotal) {
            for (let n of document.querySelectorAll('img[data-type="cross"]')) n.dataset.visible = "0";
            for (let d of document.querySelectorAll('img[data-type="check"]')) d.dataset.visible = "1";
            alert("done");
            break
        }
    }
}();