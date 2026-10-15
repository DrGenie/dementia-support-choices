function export_tool_json(resultsDir, outFile)
%EXPORT_TOOL_JSON Export the dementia DCE estimates for the web tool.
%
%   export_tool_json                       % uses outputs/results -> outputs/tool/model.json
%   export_tool_json(resultsDir, outFile)
%
%   Reads the saved results of the analysis package (s06, s07, s08, s10,
%   s14, s15, s16b, s17) and writes one JSON file with:
%     - attribute levels and the parameter each level maps to
%     - the design constraints (combinations respondents never saw)
%     - point estimates, robust SEs and R = 1000 Krinsky-Robb parameter
%       draws for the MNL, piecewise-cost MNL, sequential model C and the
%       MNL with H1 interactions
%     - MXL-R means and SDs, 1000 draws of (mean, SD), and 1000 Latin
%       hypercube standard normal draws to simulate the population
%     - the two-class latent class model (point estimates)
%     - the eight scenarios with the MATLAB values, used by the website to
%       check that its calculations reproduce MATLAB
%
%   Base MATLAB only (R2016b or later). No toolboxes.
%   Run from the project root, after RUN_ALL has produced outputs/results.

if nargin < 1 || isempty(resultsDir), resultsDir = fullfile('outputs', 'results'); end
if nargin < 2 || isempty(outFile),    outFile    = fullfile('outputs', 'tool', 'model.json'); end

R    = 1000;      % parameter draws (Krinsky-Robb)
NIND = 1000;      % simulated individuals for the MXL-R population average
SEED = 20251015;
rng(SEED, 'twister');

ld = @(f) load(fullfile(resultsDir, f));

%% ------------------------------------------------------------ load models
S = ld('s07_mnl.mat');            mnl = S.mnl.mnl3;
S = ld('s08_mxl.mat');            mx  = S.mxl.mxlR;
S = ld('s06_functional_form.mat'); pw = find_model(S.ff.cost_models, 'MNL cost piecewise');
S = ld('s14_dual.mat');           seq = S.dual.seqC;
S = ld('s15_heterogeneity.mat');  h1  = S.het.mods.H1;
S = ld('s10_lc.mat');             lc  = S.lc.lc_cov;
S = ld('s16b_econ.mat');          scen_names = cellstr(S.econ.scen_short);
S = ld('s17_service.mat');        svc = S.svc;

fprintf('Loaded: %s | %s | %s | %s | %s | %s\n', mnl.name, mx.name, pw.name, seq.name, h1.name, lc.name);

%% ------------------------------------------------------------ attributes
% Codes follow the analysis package: type 1 peer, 2 community,
% 3 counselling, 4 VR; carer 1 yes, 2 no; mode 1 in person, 2 virtual,
% 3 hybrid; frequency 1 daily, 2 weekly, 3 monthly; duration 1 30 min,
% 2 2 h, 3 4 h; distance 1 home, 2 local, 3 wider; cost 1..4 = A$0 5 20 50.
attrs = { ...
  attr('type', 'Type of support programme', { ...
     lev('peer', 'Peer support', ''), ...
     lev('community', 'Community engagement', 'type: Community engagement'), ...
     lev('counselling', 'Psychological counselling', 'type: Psychological counselling'), ...
     lev('vr', 'Virtual reality', 'type: Virtual reality')}), ...
  attr('carer', 'Support for carers', { ...
     lev('yes', 'Carer included', 'caregiver: Yes'), ...
     lev('no', 'Person with dementia only', '')}), ...
  attr('mode', 'Method of interaction', { ...
     lev('inperson', 'In person', ''), ...
     lev('virtual', 'Virtual', 'mode: Virtual'), ...
     lev('hybrid', 'Hybrid', 'mode: Hybrid')}), ...
  attr('frequency', 'Frequency', { ...
     lev('daily', 'Daily', 'frequency: Daily'), ...
     lev('weekly', 'Weekly', 'frequency: Weekly'), ...
     lev('monthly', 'Monthly', '')}), ...
  attr('duration', 'Length of each session', { ...
     lev('30min', '30 minutes', ''), ...
     lev('2h', '2 hours', 'duration: 2 hours'), ...
     lev('4h', '4 hours', 'duration: 4 hours')}), ...
  attr('distance', 'Travel', { ...
     lev('home', 'At home', ''), ...
     lev('local', 'Local, up to 12 km', 'distance: Local area (up to 12 km)'), ...
     lev('wider', 'Wider community, 50 km or more', 'distance: Wider community (50+ km)')}) };
cost = struct('key', 'cost', 'label', 'Cost per session (A$)', 'levels', [0 5 20 50], ...
              'min', 0, 'max', 50, 'param', 'cost (A$ per session)');
prices = [0 5 20 50];

forbidden = { ...
  struct('rule', 'Group programmes (peer support, community engagement) are not delivered at home in person or hybrid', ...
         'type', {{'peer', 'community'}}, 'mode', {{'inperson', 'hybrid'}}, 'distance', {{'home'}}), ...
  struct('rule', 'Virtual programmes are delivered at home', ...
         'mode', {{'virtual'}}, 'distance', {{'local', 'wider'}}), ...
  struct('rule', 'Counselling is not delivered at home in person or hybrid', ...
         'type', {{'counselling'}}, 'mode', {{'inperson', 'hybrid'}}, 'distance', {{'home'}}), ...
  struct('rule', 'In-person counselling is not daily', ...
         'type', {{'counselling'}}, 'mode', {{'inperson'}}, 'frequency', {{'daily'}}) };

%% ------------------------------------------------------------ model blocks
M = struct();
M.mnl        = model_block(mnl, R);
M.piecewise  = model_block(pw, R);   M.piecewise.knots = [5 20];
M.sequential = model_block(seq, R);
M.h1         = model_block(h1, R);

% MXL-R: map theta into (mean, sd) over xnames
sp = mx.spec;  xn = cellrow(sp.xnames);  K = numel(xn);
[mu0, sd0] = map_mxl(mx.theta(:)', sp, K);
D  = mvdraws(mx.theta(:), mx.cov_robust, R);
MU = zeros(R, K);  SD = zeros(R, K);
for r = 1:R
    [MU(r, :), SD(r, :)] = map_mxl(D(r, :), sp, K);
end
nr = numel(sp.rand);
Z = zeros(NIND, nr);                       % Latin hypercube normal draws
for j = 1:nr
    u = (randperm(NIND)' - 0.5) / NIND;
    Z(:, j) = -sqrt(2) * erfcinv(2 * u);
end
M.mxlr = struct('name', mx.name, 'params', {xn}, 'mean', sig(mu0, 6), 'sd', sig(sd0, 6), ...
    'random', double(sp.rand(:)') - 1, 'll', mx.ll, 'k', mx.k, ...
    'draws_mean', sig(MU, 5), 'draws_sd', sig(SD, 5), 'z', round(Z, 4));

M.lc2 = struct('name', lc.name, 'params', {cellrow(lc.pnames)}, 'beta', sig(lc.beta, 6), ...
    'share', sig(lc.share(:)', 6), 'gamma', sig(lc.gamma(:)', 6), ...
    'gamma_names', {cellrow(lc.Zmem_names)}, 'll', lc.ll, 'k', lc.k);

%% ------------------------------------------------------------ scenarios
codes = [2 1 1 2 2 2 1;   % S1 community social group
         1 1 3 2 2 2 2;   % S2 peer support group
         3 2 1 2 1 2 3;   % S3 counselling
         4 2 2 1 1 1 2;   % S4 VR at home
         1 1 2 2 1 1 1;   % S5 online peer support
         2 1 1 2 3 3 3;   % S6 regional day programme
         3 1 3 1 1 1 4;   % S7 intensive counselling
         2 2 1 3 3 3 1];  % S8 monthly outreach
scen = cell(1, 8);
Pm = containers.Map(cellrow(mnl.pnames), num2cell(mnl.theta(:)'));
Pq = containers.Map(cellrow(seq.pnames), num2cell(seq.theta(:)'));
fprintf('\nCheck against the MATLAB service-design results:\n');
for i = 1:8
    nm = scen_names{i};  sp1 = find(nm == ' ', 1);
    d = struct();
    for a = 1:numel(attrs)
        d.(attrs{a}.key) = attrs{a}.levels{codes(i, a)}.key;
    end
    d.price = prices(codes(i, 7));
    % MNL uptake and sequential retention, recomputed from the exported values
    u_mnl = 1 / (1 + exp(Pm('ASC opt-out') - util(d, attrs, Pm, Pm('cost (A$ per session)'))));
    vq    = util(d, attrs, Pq, Pq('cost (A$ per session)'));
    keep  = 1 / (1 + exp(-exp(Pq('scale: stage 2 (retain vs opt-out) log-scale')) * (vq - Pq('ASC opt-out'))));
    % MXL-R population average with the exported draws
    B  = repmat(mu0, NIND, 1);  B(:, sp.rand) = B(:, sp.rand) + Z .* sd0(sp.rand);
    xv = design_vector(d, attrs, xn);
    vB = B * xv';  iasc = strcmp(xn, 'ASC opt-out');
    u_mx = mean(1 ./ (1 + exp(B(:, iasc) - vB)));
    fprintf('  %-28s MNL %.4f (MATLAB %.4f)  MXL-R %.3f (MATLAB %.3f)  keep %.3f (MATLAB %.3f)\n', ...
        nm, u_mnl, svc.uM(i), u_mx, svc.uR(i), keep, svc.uS(i));
    assert(abs(u_mnl - svc.uM(i)) < 1e-6, 'MNL uptake does not reproduce MATLAB for %s: check level coding', nm);
    assert(abs(keep - svc.uS(i)) < 1e-6, 'Retention does not reproduce MATLAB for %s', nm);
    assert(abs(u_mx - svc.uR(i)) < 0.01, 'MXL-R uptake differs from MATLAB by more than simulation error for %s', nm);
    scen{i} = struct('id', nm(1:sp1-1), 'name', nm(sp1+1:end), 'design', d, ...
        'matlab', struct('uptake_mnl', svc.uM(i), 'uptake_mnl_ci', sig(svc.uM_ci(i, :), 4), ...
                         'uptake_mxlr', svc.uR(i), 'uptake_mxlr_ci', sig(svc.uR_ci(i, :), 4), ...
                         'keep_seq', svc.uS(i)));
end

%% ------------------------------------------------------------ write
out = struct();
out.meta = struct('title', 'Dementia Support Choices: model export', ...
    'study', 'Public preferences for dementia support programmes in Australia (dual-response DCE)', ...
    'n_respondents', double(mnl.n_resp), 'n_tasks', double(mnl.n_sets), ...
    'fieldwork', '24 March to 7 April 2025', 'price_range', [0 50], 'currency', 'AUD per session', ...
    'draws_note', sprintf('Krinsky-Robb draws from N(theta, robust covariance); seed %d.', SEED), ...
    'R', R, 'n_individuals', NIND, 'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')), ...
    'matlab_version', version);
out.attributes = attrs;
out.cost       = cost;
out.forbidden  = forbidden;
out.models     = M;
out.scenarios  = scen;

folder = fileparts(outFile);
if ~isempty(folder) && ~exist(folder, 'dir'), mkdir(folder); end
fid = fopen(outFile, 'w');
assert(fid > 0, 'Cannot write %s', outFile);
fwrite(fid, jsonencode(out), 'char');
fclose(fid);
info = dir(outFile);
fprintf('\nWrote %s (%.0f KB)\n', outFile, info.bytes / 1024);
end

%% ======================================================================
function m = find_model(list, name)
if iscell(list)
    for i = 1:numel(list)
        if strcmp(list{i}.name, name), m = list{i}; return; end
    end
else
    for i = 1:numel(list)
        if strcmp(list(i).name, name), m = list(i); return; end
    end
end
error('Model "%s" not found', name);
end

function s = attr(key, label, levels)
s = struct('key', key, 'label', label);
s.levels = levels;                          % cell -> JSON array of objects
end

function s = lev(key, label, param)
s = struct('key', key, 'label', label, 'param', param);
end

function c = cellrow(x)
if ischar(x), c = cellstr(x)'; elseif isstring(x), c = cellstr(x(:))'; else, c = x(:)'; end
end

function B = model_block(m, R)
theta = m.theta(:);
D = mvdraws(theta, m.cov_robust, R);
B = struct('name', m.name, 'params', {cellrow(m.pnames)}, 'theta', sig(theta', 6), ...
           'se', sig(m.se_robust(:)', 6), 'll', m.ll, 'k', double(m.k), 'draws', sig(D, 5));
end

function D = mvdraws(theta, C, R)
% Draws from N(theta, C) using an eigen factor (robust to near-singular C)
C = (C + C') / 2;
[V, E] = eig(C);
A = V * diag(sqrt(max(diag(E), 0)));
D = theta(:)' + randn(R, numel(theta)) * A';
end

function [mu, sd] = map_mxl(th, sp, K)
mu = zeros(1, K);  sd = zeros(1, K);
mu(sp.fixed) = th(sp.idx.fixed);
mu(sp.rand)  = th(sp.idx.mean);
sd(sp.rand)  = abs(th(sp.idx.sd));
end

function v = util(d, attrs, P, bcost)
v = bcost * d.price;
for a = 1:numel(attrs)
    L = attrs{a}.levels;
    for l = 1:numel(L)
        if strcmp(L{l}.key, d.(attrs{a}.key)) && ~isempty(L{l}.param)
            v = v + P(L{l}.param);
        end
    end
end
end

function x = design_vector(d, attrs, xn)
x = zeros(1, numel(xn));
for a = 1:numel(attrs)
    L = attrs{a}.levels;
    for l = 1:numel(L)
        if strcmp(L{l}.key, d.(attrs{a}.key)) && ~isempty(L{l}.param)
            x(strcmp(xn, L{l}.param)) = 1;
        end
    end
end
x(strcmp(xn, 'cost (A$ per session)')) = d.price;
end

function y = sig(x, n)
% Round to n significant digits (keeps the JSON small)
y = x;
nz = x ~= 0 & isfinite(x);
y(nz) = round(x(nz), n, 'significant');
end
