 function isValidHexColor(color) {
    const re = /^([0-9A-F]{3}){1,2}$/i;
    return re.test(color);
}
module.exports = {
    isValidHexColor
};
